import axios, { AxiosInstance } from "axios";
import { WhatsAppGateway, SessionEnsureResult } from "./WhatsAppGateway";

/**
 * WAHA (WhatsApp HTTP API) gateway. Ports the logic from the original Apps
 * Script (ensureSessionStarted_, getQrFast_, goOffline_, sendText,
 * startTyping/stopTyping) into a reusable, multi-tenant-safe client: every
 * call takes an explicit sessionId instead of assuming a single global
 * "default" session, so each user's each phone number gets its own isolated
 * WAHA session.
 */
export class WahaGateway implements WhatsAppGateway {
  readonly kind = "waha";
  private http: AxiosInstance;

  constructor(baseUrl: string, apiKey: string) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ""),
      headers: { "X-Api-Key": apiKey, "Cache-Control": "no-cache" },
      validateStatus: () => true, // we inspect status codes ourselves
      timeout: 20000,
    });
  }

  private chatId(recipient: string) {
    return `${this.normalizePhone(recipient)}@c.us`;
  }

  private normalizePhone(number: string): string {
    const cleaned = String(number).replace(/\D/g, "");
    return cleaned.length < 9 ? `968${cleaned}` : cleaned;
  }

  async ensureSession(sessionId: string, meta?: Record<string, string>): Promise<SessionEnsureResult> {
    // 1) Try to start directly (works if it already exists).
    let start = await this.http.post(`/api/sessions/${encodeURIComponent(sessionId)}/start`);
    if (![200, 201, 409, 422].includes(start.status)) {
      // 2) Doesn't exist yet -> create it.
      const create = await this.http.post(`/api/sessions`, {
        name: sessionId,
        start: true,
        config: {
          metadata: meta ?? {},
          noweb: { markOnline: false, markOnlineOnConnect: false, store: { enabled: true, fullSync: false } },
        },
      });
      if (![200, 201, 409].includes(create.status)) {
        return { status: "error", message: `Create session failed (${create.status})` };
      }
      start = await this.http.post(`/api/sessions/${encodeURIComponent(sessionId)}/start`);
    }
    await this.goOffline(sessionId);
    return this.getSessionStatus(sessionId);
  }

  async getSessionStatus(sessionId: string): Promise<SessionEnsureResult> {
    const encId = encodeURIComponent(sessionId);
    const qr = await this.http.get(`/api/sessions/${encId}/auth/qr`, {
      headers: { Accept: "image/*,application/json" },
      responseType: "arraybuffer",
      params: { t: Date.now() },
    });

    const contentType = String(qr.headers["content-type"] ?? "");
    if (qr.status >= 200 && qr.status < 300 && contentType.startsWith("image/")) {
      const b64 = Buffer.from(qr.data).toString("base64");
      return { status: "qr", qrImageBase64: `data:${contentType};base64,${b64}` };
    }
    if (qr.status === 204) return { status: "connected" };

    // Non-image body: parse JSON message if possible.
    let message = "";
    try {
      message = JSON.parse(Buffer.from(qr.data).toString("utf8"))?.message ?? "";
    } catch {
      /* ignore */
    }

    if (qr.status === 404 || /does not exist/i.test(message)) {
      return { status: "pending", message: "Session not created yet" };
    }
    return { status: "error", message: message || `QR fetch failed (${qr.status})` };
  }

  private async goOffline(sessionId: string) {
    const encId = encodeURIComponent(sessionId);
    await this.http.post(`/api/sessions/${encId}/presence/offline`).catch(() => undefined);
  }

  async startTyping(sessionId: string, recipient: string): Promise<void> {
    await this.http.post(`/api/startTyping`, { chatId: this.chatId(recipient), session: sessionId });
  }

  async stopTyping(sessionId: string, recipient: string): Promise<void> {
    await this.http.post(`/api/stopTyping`, { chatId: this.chatId(recipient), session: sessionId });
  }

  async sendText(sessionId: string, recipient: string, text: string): Promise<boolean> {
    const res = await this.http.post(`/api/sendText`, {
      chatId: this.chatId(recipient),
      reply_to: null,
      text,
      linkPreview: true,
      session: sessionId,
    });
    return res.status === 201 || res.status === 200;
  }
}
