import { Router } from "express";
import crypto from "crypto";
import { google } from "googleapis";
import { requireAdmin, requireUser, AuthedRequest } from "../../auth/apiKeyAuth";
import { buildGoogleAuthUrl, getOAuthClient } from "../../auth/googleOAuth";
import { loadSettings, updateSettings } from "../../settings/settingsStore";
import { reloadStorage } from "../../storage";
import { StorageAdapter } from "../../storage/StorageAdapter";

/**
 * "Connect with Google" for the Sheets storage backend - redirect-based
 * OAuth instead of pasting a service-account JSON key. Flow, driven by
 * public/settings.html:
 *
 *   1. GET  /api/integrations/google/connect   -> redirects to Google
 *   2. Google shows its own consent screen, redirects back to:
 *      GET  /api/integrations/google/callback  -> exchanges the code for a
 *           refresh token, stores it, redirects to Settings
 *   3. GET  /api/integrations/google/spreadsheets -> list the person's
 *      sheets so they pick one, or
 *      POST /api/integrations/google/spreadsheets -> create a brand-new one
 *   4. POST /api/integrations/google/select -> pick which spreadsheet the
 *      app should actually use, then hot-reloads storage
 *
 * Gated by the admin key since it changes shared platform storage config,
 * same as the rest of /api/settings. The one exception is
 * GET /integrations/google/contacts (any user) - see the comment there.
 */
export function integrationsRouter(storage: StorageAdapter): Router {
  const router = Router();
  const pendingStates = new Set<string>();
  let contactsCache: { fetchedAt: number; contacts: Array<{ name: string; phoneNumber: string }> } | null = null;

  router.get("/integrations/google/status", requireAdmin, (_req, res) => {
    const settings = loadSettings();
    res.json({
      connected: !!settings.sheets.oauth?.refreshToken,
      connectedEmail: settings.sheets.oauth?.connectedEmail ?? null,
      selectedSpreadsheetId: settings.sheets.authMode === "oauth" ? settings.sheets.spreadsheetId || null : null,
    });
  });

  router.get("/integrations/google/connect", requireAdmin, (_req, res) => {
    try {
      const state = crypto.randomBytes(16).toString("hex");
      pendingStates.add(state);
      setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000); // 10 min to complete sign-in
      res.redirect(buildGoogleAuthUrl(state));
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  router.get("/integrations/google/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;
    if (error) return res.status(400).send(`Google sign-in failed: ${error}`);
    if (!code || !state || !pendingStates.has(state)) {
      return res.status(400).send("Invalid or expired sign-in attempt. Go back to Settings and click Connect with Google again.");
    }
    pendingStates.delete(state);

    try {
      const client = getOAuthClient();
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      // `as any`: see the note in src/auth/googleOAuth.ts about googleapis's
      // duplicate nested google-auth-library copies - harmless at runtime.
      const oauth2 = google.oauth2({ version: "v2", auth: client as any });
      const { data: profile } = await oauth2.userinfo.get();

      const settings = loadSettings();
      updateSettings({
        sheets: {
          ...settings.sheets,
          authMode: "oauth",
          oauth: {
            refreshToken: tokens.refresh_token ?? settings.sheets.oauth?.refreshToken ?? "",
            accessToken: tokens.access_token ?? undefined,
            expiryDate: tokens.expiry_date ?? undefined,
            connectedEmail: profile.email ?? undefined,
          },
        },
      });

      res.redirect("/settings.html?google=connected");
    } catch (err: any) {
      console.error("[integrations] Google OAuth callback failed:", err);
      res.status(500).send(`Could not finish connecting Google: ${err.message}`);
    }
  });

  router.get("/integrations/google/spreadsheets", requireAdmin, async (_req, res) => {
    const settings = loadSettings();
    if (!settings.sheets.oauth?.refreshToken) return res.status(400).json({ error: "Google isn't connected yet" });
    try {
      const client = getOAuthClient();
      client.setCredentials({ refresh_token: settings.sheets.oauth.refreshToken });
      const drive = google.drive({ version: "v3", auth: client as any });
      const { data } = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        fields: "files(id,name,modifiedTime)",
        orderBy: "modifiedTime desc",
        pageSize: 25,
      });
      res.json(data.files ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/integrations/google/spreadsheets", requireAdmin, async (req, res) => {
    const settings = loadSettings();
    if (!settings.sheets.oauth?.refreshToken) return res.status(400).json({ error: "Google isn't connected yet" });
    try {
      const client = getOAuthClient();
      client.setCredentials({ refresh_token: settings.sheets.oauth.refreshToken });
      const sheets = google.sheets({ version: "v4", auth: client as any });
      const { data } = await sheets.spreadsheets.create({
        requestBody: { properties: { title: req.body?.title || "WhatsApp Reminder Platform" } },
      });
      res.status(201).json({ id: data.spreadsheetId, name: data.properties?.title });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Powers the recipient searchable name+number dropdown in /reminder.html.
  // Any logged-in user can call this (requireUser, not requireAdmin) - it
  // reads from whichever single Google account is connected in Settings
  // (the same one used for Sheets), shared across every user on this
  // deployment, not each user's own account. If Google isn't connected yet,
  // returns an empty list rather than an error so manual number entry keeps
  // working regardless.
  router.get("/integrations/google/contacts", requireUser(storage), async (req: AuthedRequest, res) => {
    const settings = loadSettings();
    if (!settings.sheets.oauth?.refreshToken) return res.json([]);

    const q = String(req.query.q ?? "").trim().toLowerCase();
    try {
      const contacts = await getCachedContacts();
      const filtered = q ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phoneNumber.includes(q)) : contacts;
      res.json(filtered.slice(0, 50));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // people.connections.list only ever returns the first 1000 connections
  // (fine for a personal/family contacts list, not a full CRM), and there's
  // no per-keystroke-friendly search endpoint that doesn't need a separate
  // cache warm-up step (people.searchContacts), so this fetches the whole
  // list and filters in-process instead - cached for a few minutes so
  // typing in the recipient box doesn't hit Google on every keystroke.
  async function getCachedContacts() {
    const CACHE_MS = 5 * 60 * 1000;
    if (contactsCache && Date.now() - contactsCache.fetchedAt < CACHE_MS) return contactsCache.contacts;

    const settings = loadSettings();
    const client = getOAuthClient();
    client.setCredentials({ refresh_token: settings.sheets.oauth!.refreshToken });
    const people = google.people({ version: "v1", auth: client as any });
    const { data } = await people.people.connections.list({
      resourceName: "people/me",
      personFields: "names,phoneNumbers",
      pageSize: 1000,
    });
    const contacts = (data.connections ?? [])
      .flatMap((p) => {
        const name = p.names?.[0]?.displayName ?? "(no name)";
        return (p.phoneNumbers ?? []).map((ph) => ({
          name,
          phoneNumber: (ph.value ?? "").replace(/[^\d+]/g, ""),
        }));
      })
      .filter((c) => c.phoneNumber);

    contactsCache = { fetchedAt: Date.now(), contacts };
    return contacts;
  }

  router.post("/integrations/google/select", requireAdmin, async (req, res) => {
    const { spreadsheetId } = req.body ?? {};
    if (!spreadsheetId) return res.status(400).json({ error: "spreadsheetId is required" });

    const settings = loadSettings();
    updateSettings({ sheets: { ...settings.sheets, spreadsheetId, authMode: "oauth" } });
    try {
      await reloadStorage();
      res.json({ ok: true });
    } catch (err: any) {
      // Saved, but "sheets" may not be an enabled backend yet - Settings
      // surfaces this so the user can flip the checkbox on.
      res.status(202).json({ ok: false, error: err.message });
    }
  });

  return router;
}
