import { google } from "googleapis";
import { config } from "../config";

// NOTE: googleapis bundles its own nested copy of google-auth-library
// (separate from the one googleapis-common - one of googleapis's own
// dependencies - nests too), so TypeScript sees two structurally-identical
// but nominally distinct OAuth2Client classes. Typing this function's
// return value against an explicit `Auth.OAuth2Client` import trips that
// mismatch the moment the client is later passed into google.sheets()/
// drive()/oauth2() (which type-check `auth` against the *other* copy).
// Letting the return type be inferred, and using `as any` at the few call
// sites that hand the client to those factories, sidesteps a purely
// typings-level duplicate-package issue that has no effect at runtime.

/**
 * "Connect with Google" - a normal OAuth2 authorization-code flow, used
 * instead of asking the person running this app to open the Google Cloud
 * Console, enable the Sheets/Drive APIs, create a service account, and paste
 * a JSON key into a config file. With this, they click one button in
 * Settings, get redirected to Google's own consent screen, and land back
 * here already authorized against their own Drive - see
 * src/api/routes/integrations.ts for the routes that drive this, and
 * SheetsAdapter.fromOAuth() for how the resulting refresh token is used.
 *
 * GOOGLE_OAUTH_CLIENT_ID/SECRET belong to one OAuth client registered once
 * by whoever deploys this app (Google Cloud Console -> APIs & Services ->
 * Credentials -> OAuth client ID -> Web application, with
 * GOOGLE_OAUTH_REDIRECT_URI added under "Authorized redirect URIs"). End
 * users of the platform never touch that console themselves.
 */
export function getOAuthClient() {
  if (!config.googleOAuth.clientId || !config.googleOAuth.clientSecret) {
    throw new Error(
      "Google sign-in isn't configured on this deployment yet (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET missing)"
    );
  }
  return new google.auth.OAuth2(
    config.googleOAuth.clientId,
    config.googleOAuth.clientSecret,
    config.googleOAuth.redirectUri
  );
}

// spreadsheets: read/write the sheets this app uses.
// drive.file: only files the *app itself* created or the user explicitly
// opened with it - not blanket read access to the person's whole Drive.
export const SHEETS_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function buildGoogleAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // request a refresh_token, not just a short-lived access token
    prompt: "consent", // force Google to hand back a refresh_token every time, not just on first-ever connect
    scope: SHEETS_OAUTH_SCOPES,
    state,
  });
}
