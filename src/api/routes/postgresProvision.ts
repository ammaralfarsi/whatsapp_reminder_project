import { Router } from "express";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Client } from "pg";
import { requireAdmin } from "../../auth/apiKeyAuth";
import { loadSettings, updateSettings } from "../../settings/settingsStore";
import { reloadStorage } from "../../storage";

/**
 * Two ways to get the Postgres storage backend running, picked from the
 * Settings page:
 *
 *  - "auto": generate strong random credentials and stand up a
 *    postgres:16-alpine container ourselves via the Docker socket
 *    (dockerode), attaching it to whichever Docker network this app's own
 *    container is already on so it's reachable by container name - no port
 *    mapping guesswork. If no Docker socket is reachable (the common case
 *    inside the Home Assistant add-on sandbox, which has no Docker access),
 *    we still generate the credentials and hand back a ready-to-run
 *    docker-compose service block plus the resulting connection string, so
 *    it's one paste instead of hand-writing a password and a compose file.
 *  - "manual": point at a Postgres that already exists (your own server, a
 *    managed one, the official HA "PostgreSQL" add-on) - fill in
 *    host/port/db/user/password, we test the connection before saving.
 *
 * Either way, migrations/*.sql are applied automatically once the
 * connection is live, so there's no separate "run migrate" step.
 */
export function postgresRouter(): Router {
  const router = Router();

  router.post("/settings/postgres/test", requireAdmin, async (req, res) => {
    const { host, port, database, user, password, ssl } = req.body ?? {};
    if (!host || !database || !user) return res.status(400).json({ error: "host, database and user are required" });
    const client = new Client({
      host,
      port: Number(port ?? 5432),
      database,
      user,
      password: password ?? "",
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5000,
    });
    try {
      await client.connect();
      await client.query("SELECT 1");
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    } finally {
      await client.end().catch(() => undefined);
    }
  });

  router.post("/settings/postgres/manual", requireAdmin, async (req, res) => {
    const { host, port, database, user, password, ssl } = req.body ?? {};
    if (!host || !database || !user) return res.status(400).json({ error: "host, database and user are required" });

    const databaseUrl = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password ?? "")}@${host}:${port ?? 5432}/${database}`;
    updateSettings({
      postgres: {
        mode: "manual",
        databaseUrl,
        ssl: !!ssl,
        manual: { host, port: Number(port ?? 5432), database, user, password: password ?? "" },
      },
    });

    try {
      await applyMigrations(databaseUrl, !!ssl);
      await reloadStorage();
      res.json({ ok: true, databaseUrl: redact(databaseUrl) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/settings/postgres/auto", requireAdmin, async (_req, res) => {
    try {
      const result = await provisionAuto();
      updateSettings({
        postgres: {
          mode: "auto",
          databaseUrl: result.databaseUrl,
          ssl: false,
          auto: {
            containerName: result.containerName,
            generatedPassword: result.password,
            provisioned: result.started,
            provisionedAt: new Date().toISOString(),
          },
        },
      });

      if (result.started) {
        await applyMigrations(result.databaseUrl, false);
        await reloadStorage();
      }
      res.json({ ...result, databaseUrl: redact(result.databaseUrl) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

function redact(databaseUrl: string): string {
  return databaseUrl.replace(/:([^:@]+)@/, ":***@");
}

async function applyMigrations(databaseUrl: string, ssl: boolean): Promise<void> {
  const client = new Client({ connectionString: databaseUrl, ssl: ssl ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    const dir = path.join(process.cwd(), "migrations");
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await client.query(fs.readFileSync(path.join(dir, file), "utf-8"));
    }
  } finally {
    await client.end();
  }
}

interface ProvisionResult {
  started: boolean;
  containerName: string;
  password: string;
  databaseUrl: string;
  composeSnippet?: string;
  note: string;
}

const AUTO_CONTAINER_NAME = "whatsapp-reminder-db-auto";
const AUTO_HOST_PORT = 5433; // avoid clashing with the docker-compose.yml bundled `postgres` service on 5432
const AUTO_VOLUME = "whatsapp_reminder_pg_auto_data";

async function provisionAuto(): Promise<ProvisionResult> {
  const composeSnippet = buildComposeSnippet();

  let docker: any;
  try {
    const { default: Dockerode } = await import("dockerode");
    docker = new Dockerode(); // honors DOCKER_HOST, else the default /var/run/docker.sock
    await docker.ping();
  } catch {
    return {
      started: false,
      containerName: AUTO_CONTAINER_NAME,
      password: crypto.randomBytes(18).toString("base64url"),
      databaseUrl: "",
      composeSnippet,
      note:
        "No Docker socket reachable from this app (expected inside the Home Assistant add-on sandbox, which has no Docker access). Add the block below to your docker-compose.yml, run `docker compose up -d`, then use Manual mode with the resulting host/port/user/password - or bind-mount /var/run/docker.sock into this app's container to enable one-click Auto provisioning.",
    };
  }

  const existing = docker.getContainer(AUTO_CONTAINER_NAME);
  try {
    const info = await existing.inspect();
    const envPassword =
      (info.Config?.Env as string[] | undefined)?.find((e) => e.startsWith("POSTGRES_PASSWORD="))?.split("=")[1] ?? "";
    if (!info.State?.Running) await existing.start();
    const network = Object.keys(info.NetworkSettings?.Networks ?? {})[0];
    const databaseUrl = network
      ? `postgres://reminder_user:${envPassword}@${AUTO_CONTAINER_NAME}:5432/reminders`
      : `postgres://reminder_user:${envPassword}@localhost:${AUTO_HOST_PORT}/reminders`;
    return {
      started: true,
      containerName: AUTO_CONTAINER_NAME,
      password: envPassword,
      databaseUrl,
      note: info.State?.Running
        ? "Reused the already-running auto-provisioned Postgres container."
        : "Started the existing auto-provisioned Postgres container.",
    };
  } catch {
    // Doesn't exist yet - fall through and create it.
  }

  const password = crypto.randomBytes(18).toString("base64url");
  const network = await detectSelfNetwork(docker);

  const hostConfig: any = {
    RestartPolicy: { Name: "unless-stopped" },
    Binds: [`${AUTO_VOLUME}:/var/lib/postgresql/data`],
  };
  let databaseUrl: string;
  if (network) {
    databaseUrl = `postgres://reminder_user:${password}@${AUTO_CONTAINER_NAME}:5432/reminders`;
  } else {
    hostConfig.PortBindings = { "5432/tcp": [{ HostPort: String(AUTO_HOST_PORT) }] };
    databaseUrl = `postgres://reminder_user:${password}@localhost:${AUTO_HOST_PORT}/reminders`;
  }

  await pullImage(docker, "postgres:16-alpine");
  const container = await docker.createContainer({
    name: AUTO_CONTAINER_NAME,
    Image: "postgres:16-alpine",
    Env: ["POSTGRES_USER=reminder_user", `POSTGRES_PASSWORD=${password}`, "POSTGRES_DB=reminders"],
    ExposedPorts: { "5432/tcp": {} },
    HostConfig: hostConfig,
    ...(network ? { NetworkingConfig: { EndpointsConfig: { [network]: {} } } } : {}),
  });
  await container.start();

  // Give Postgres a moment to accept connections before migrations run.
  await new Promise((resolve) => setTimeout(resolve, 3000));

  return {
    started: true,
    containerName: AUTO_CONTAINER_NAME,
    password,
    databaseUrl,
    note: network
      ? `Created and started container "${AUTO_CONTAINER_NAME}" on the "${network}" network.`
      : `Created and started container "${AUTO_CONTAINER_NAME}", reachable at localhost:${AUTO_HOST_PORT} (this app doesn't appear to be running inside a Docker network itself, so the container was port-mapped to the host instead).`,
  };
}

async function detectSelfNetwork(docker: any): Promise<string | null> {
  try {
    const self = docker.getContainer(os.hostname());
    const info = await self.inspect();
    const networks = Object.keys(info.NetworkSettings?.Networks ?? {});
    return networks[0] ?? null;
  } catch {
    return null;
  }
}

function pullImage(docker: any, image: string): Promise<void> {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err: any, stream: any) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err2: any) => (err2 ? reject(err2) : resolve()));
    });
  });
}

function buildComposeSnippet(): string {
  return [
    "  postgres-auto:",
    "    image: postgres:16-alpine",
    `    container_name: ${AUTO_CONTAINER_NAME}`,
    "    restart: unless-stopped",
    "    environment:",
    "      POSTGRES_USER: reminder_user",
    "      POSTGRES_PASSWORD: <generate-your-own-strong-password>",
    "      POSTGRES_DB: reminders",
    "    ports:",
    `      - "${AUTO_HOST_PORT}:5432"`,
    "    volumes:",
    `      - ${AUTO_VOLUME}:/var/lib/postgresql/data`,
    "      - ./migrations:/docker-entrypoint-initdb.d:ro",
  ].join("\n");
}
