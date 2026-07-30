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
 * Settings page (or, for the Home Assistant add-on, straight from the
 * Configuration tab - see whatsapp_reminder_platform/config.yaml + run.sh):
 *
 *  - "auto": generate strong random credentials (or use the initial details
 *    you provided - database/user/password/port) and stand up a
 *    postgres:16-alpine container ourselves via the Docker socket
 *    (dockerode), attaching it to whichever Docker network this app's own
 *    container is already on so it's reachable by container name - no port
 *    mapping guesswork. This only works for the plain Docker/docker-compose
 *    deployment, where the real /var/run/docker.sock is bind-mounted in with
 *    read-write access. It does NOT work for the Home Assistant add-on: HA's
 *    `docker_api` option (see config.yaml) only grants *read-only* access to
 *    a Supervisor-proxied Docker API, by Home Assistant's own design - so
 *    container creation is refused there no matter what. If no writable
 *    Docker socket is reachable, we still generate the credentials and hand
 *    back a ready-to-run docker-compose service block plus the resulting
 *    connection string; for the HA add-on, the right move is Manual mode
 *    pointed at a Postgres you already have (your own server, a managed
 *    one, or the official "PostgreSQL" add-on).
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

  // Fields are all optional here - anything left blank falls back to a
  // sensible default (or, for password, a freshly generated one), which is
  // the "initial details" a user without an existing Postgres can either
  // fill in themselves or just leave alone and click go.
  router.post("/settings/postgres/auto", requireAdmin, async (req, res) => {
    try {
      const { database, user, password, port } = req.body ?? {};
      const result = await provisionPostgresAuto({
        database,
        user,
        password,
        port: port ? Number(port) : undefined,
      });
      applyProvisionResult(result);

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

/** Persists a provisionPostgresAuto() result into settingsStore - shared by
 * the /auto route above and the boot-time auto-provision hook in
 * src/index.ts, so both paths end up in the exact same state. */
export function applyProvisionResult(result: ProvisionResult): void {
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
}

function redact(databaseUrl: string): string {
  if (!databaseUrl) return databaseUrl;
  return databaseUrl.replace(/:([^:@]+)@/, ":***@");
}

export async function applyMigrations(databaseUrl: string, ssl: boolean): Promise<void> {
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

export interface ProvisionResult {
  started: boolean;
  containerName: string;
  password: string;
  databaseUrl: string;
  composeSnippet?: string;
  note: string;
}

export interface ProvisionOptions {
  /** Database name to create. Default: "reminders". */
  database?: string;
  /** Role to create/use. Default: "reminder_user". */
  user?: string;
  /** Password for that role. Default: a freshly generated random one. */
  password?: string;
  /** Host port to publish on, only used when this app isn't itself on a
   * Docker network the new container can join directly. Default: 5433. */
  port?: number;
}

const AUTO_CONTAINER_NAME = "whatsapp-reminder-db-auto";
const DEFAULT_HOST_PORT = 5433; // avoid clashing with the docker-compose.yml bundled `postgres` service on 5432
const AUTO_VOLUME = "whatsapp_reminder_pg_auto_data";

/**
 * Creates (or reuses) a postgres:16-alpine container using the given
 * initial details - what a user without a Postgres already set up fills in
 * (or leaves blank, in which case sensible defaults / a generated password
 * are used). Called from the /settings/postgres/auto route and from the
 * boot-time auto-provision attempt in src/index.ts.
 */
export async function provisionPostgresAuto(opts: ProvisionOptions = {}): Promise<ProvisionResult> {
  const database = opts.database?.trim() || "reminders";
  const user = opts.user?.trim() || "reminder_user";
  const hostPort = opts.port || DEFAULT_HOST_PORT;
  const composeSnippet = buildComposeSnippet(database, user, hostPort);

  const isHaAddon = !!process.env.SUPERVISOR_TOKEN;
  const notWritableNote = isHaAddon
    ? "This Home Assistant add-on can't create a Postgres container for you: the `docker_api` option only grants read-only access to the Docker API (that's how Home Assistant designed it, not a bug here) - so container creation is always refused, regardless of config. Please use Manual mode instead, pointing at a Postgres you already have, or install the official \"PostgreSQL\" add-on and point Manual mode at that."
    : "No writable Docker socket reachable from this app. Bind-mount /var/run/docker.sock into this app's container (see the commented-out line in docker-compose.yml) and make sure the user this runs as can access it. Until then, add the block below to your docker-compose.yml and run `docker compose up -d`, or switch to Manual mode.";

  let docker: any;
  try {
    const { default: Dockerode } = await import("dockerode");
    docker = new Dockerode(); // honors DOCKER_HOST, else the default /var/run/docker.sock
    await docker.ping();
  } catch {
    return {
      started: false,
      containerName: AUTO_CONTAINER_NAME,
      password: opts.password || crypto.randomBytes(18).toString("base64url"),
      databaseUrl: "",
      composeSnippet,
      note: notWritableNote,
    };
  }

  const existing = docker.getContainer(AUTO_CONTAINER_NAME);
  try {
    const info = await existing.inspect();
    const envPassword =
      (info.Config?.Env as string[] | undefined)?.find((e) => e.startsWith("POSTGRES_PASSWORD="))?.split("=")[1] ?? "";
    const envDb = (info.Config?.Env as string[] | undefined)?.find((e) => e.startsWith("POSTGRES_DB="))?.split("=")[1] ?? database;
    const envUser =
      (info.Config?.Env as string[] | undefined)?.find((e) => e.startsWith("POSTGRES_USER="))?.split("=")[1] ?? user;
    if (!info.State?.Running) await existing.start();
    const network = Object.keys(info.NetworkSettings?.Networks ?? {})[0];
    const databaseUrl = network
      ? `postgres://${envUser}:${envPassword}@${AUTO_CONTAINER_NAME}:5432/${envDb}`
      : `postgres://${envUser}:${envPassword}@localhost:${hostPort}/${envDb}`;
    return {
      started: true,
      containerName: AUTO_CONTAINER_NAME,
      password: envPassword,
      databaseUrl,
      note: info.State?.Running
        ? "Reused the already-running auto-provisioned Postgres container (its original database/user/password, not these new details)."
        : "Started the existing auto-provisioned Postgres container.",
    };
  } catch {
    // Doesn't exist yet - fall through and create it.
  }

  const password = opts.password?.trim() || crypto.randomBytes(18).toString("base64url");
  const network = await detectSelfNetwork(docker);

  const hostConfig: any = {
    RestartPolicy: { Name: "unless-stopped" },
    Binds: [`${AUTO_VOLUME}:/var/lib/postgresql/data`],
  };
  let databaseUrl: string;
  if (network) {
    databaseUrl = `postgres://${user}:${password}@${AUTO_CONTAINER_NAME}:5432/${database}`;
  } else {
    hostConfig.PortBindings = { "5432/tcp": [{ HostPort: String(hostPort) }] };
    databaseUrl = `postgres://${user}:${password}@localhost:${hostPort}/${database}`;
  }

  try {
    await pullImage(docker, "postgres:16-alpine");
    const container = await docker.createContainer({
      name: AUTO_CONTAINER_NAME,
      Image: "postgres:16-alpine",
      Env: [`POSTGRES_USER=${user}`, `POSTGRES_PASSWORD=${password}`, `POSTGRES_DB=${database}`],
      ExposedPorts: { "5432/tcp": {} },
      HostConfig: hostConfig,
      ...(network ? { NetworkingConfig: { EndpointsConfig: { [network]: {} } } } : {}),
    });
    await container.start();
  } catch (err: any) {
    // The socket answered `ping` (read access works) but a write call
    // (pull/create/start) was refused - exactly what happens on Home
    // Assistant's Supervisor-proxied, read-only `docker_api` socket. Degrade
    // to the same "can't do this here" result instead of a raw 500, so the
    // caller (route handler or boot-time hook) can show useful guidance.
    const permissionDenied = err?.statusCode === 403 || /permission denied|EACCES/i.test(err?.message ?? "");
    return {
      started: false,
      containerName: AUTO_CONTAINER_NAME,
      password,
      databaseUrl: "",
      composeSnippet,
      note: permissionDenied ? notWritableNote : `Failed to create the Postgres container: ${err?.message ?? err}`,
    };
  }

  // Give Postgres a moment to accept connections before migrations run.
  await new Promise((resolve) => setTimeout(resolve, 3000));

  return {
    started: true,
    containerName: AUTO_CONTAINER_NAME,
    password,
    databaseUrl,
    note: network
      ? `Created and started container "${AUTO_CONTAINER_NAME}" (database "${database}", user "${user}") on the "${network}" network.`
      : `Created and started container "${AUTO_CONTAINER_NAME}" (database "${database}", user "${user}"), reachable at localhost:${hostPort} (this app doesn't appear to be running inside a Docker network itself, so the container was port-mapped to the host instead).`,
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

function buildComposeSnippet(database: string, user: string, hostPort: number): string {
  return [
    "  postgres-auto:",
    "    image: postgres:16-alpine",
    `    container_name: ${AUTO_CONTAINER_NAME}`,
    "    restart: unless-stopped",
    "    environment:",
    `      POSTGRES_USER: ${user}`,
    "      POSTGRES_PASSWORD: <generate-your-own-strong-password>",
    `      POSTGRES_DB: ${database}`,
    "    ports:",
    `      - "${hostPort}:5432"`,
    "    volumes:",
    `      - ${AUTO_VOLUME}:/var/lib/postgresql/data`,
    "      - ./migrations:/docker-entrypoint-initdb.d:ro",
  ].join("\n");
}
