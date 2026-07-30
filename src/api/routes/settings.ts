import { Router } from "express";
import { requireAdmin } from "../../auth/apiKeyAuth";
import { loadSettings, updateSettings } from "../../settings/settingsStore";
import { AppSettings, StorageKind } from "../../settings/types";
import { reloadStorage } from "../../storage";
import { postgresRouter } from "./postgresProvision";

const VALID_BACKENDS: StorageKind[] = ["postgres", "sheets", "ha_local"];

/**
 * Backs the Settings web page (public/settings.html): the multi-select of
 * storage backends (Home Assistant local / Google Sheet / Postgres) plus a
 * status view of how each is currently configured. Backend-specific setup
 * (Google OAuth connect, Postgres auto/manual) lives in
 * integrations.ts / postgresProvision.ts - this file just owns the
 * "which ones are turned on" switch and read-only status.
 */
export function settingsRouter(): Router {
  const router = Router();

  router.get("/settings", requireAdmin, (_req, res) => {
    res.json(redact(loadSettings()));
  });

  router.put("/settings/backends", requireAdmin, async (req, res) => {
    const { enabledBackends } = req.body ?? {};
    if (!Array.isArray(enabledBackends) || enabledBackends.length === 0) {
      return res.status(400).json({ error: `enabledBackends must be a non-empty array from: ${VALID_BACKENDS.join(", ")}` });
    }
    if (!enabledBackends.every((b: string) => VALID_BACKENDS.includes(b as StorageKind))) {
      return res.status(400).json({ error: `Unknown backend - valid values: ${VALID_BACKENDS.join(", ")}` });
    }

    updateSettings({ enabledBackends });
    try {
      await reloadStorage();
      res.json({ ok: true });
    } catch (err: any) {
      // Saved so the checkbox state sticks, but couldn't switch over live yet
      // (e.g. Postgres picked before finishing Auto/Manual setup) - the
      // Settings page surfaces this message so the user knows what's left.
      res.status(202).json({ ok: false, error: err.message });
    }
  });

  router.use("/", postgresRouter());

  return router;
}

function redact(s: AppSettings) {
  return {
    ...s,
    postgres: {
      ...s.postgres,
      databaseUrl: s.postgres.databaseUrl ? "***configured***" : "",
      manual: s.postgres.manual ? { ...s.postgres.manual, password: s.postgres.manual.password ? "***" : "" } : undefined,
      auto: s.postgres.auto
        ? { ...s.postgres.auto, generatedPassword: s.postgres.auto.generatedPassword ? "***" : "" }
        : undefined,
    },
    sheets: {
      ...s.sheets,
      oauth: s.sheets.oauth
        ? { connectedEmail: s.sheets.oauth.connectedEmail, refreshToken: s.sheets.oauth.refreshToken ? "***connected***" : "" }
        : undefined,
    },
  };
}
