import axios, { AxiosInstance } from "axios";
import { WhatsAppGateway, SessionEnsureResult } from "./WhatsAppGateway";

/**
 * Adapter for https://faserf.github.io/ha-whatsapp/ - a Home Assistant
 * custom integration that runs its own WhatsApp Web session and exposes it
 * as HA entities/services, rather than a standalone HTTP API like WAHA.
 *
 * IMPORTANT - this adapter is a best-effort stub, not a verified client.
 * ha-whatsapp doesn't expose a documented multi-session HTTP API the way
 * WAHA does; it's designed around one HA instance driving one WhatsApp
 * connection through its config flow (QR pairing happens in the HA UI, not
 * programmatically). Concretely:
 *   - sendText() calls the HA REST API's generic "call a service" endpoint
 *     (POST /api/services/<domain>/<service>), which is how any HA
 *     integration's actions are triggered externally. The service name and
 *     payload keys below (HA_WHATSAPP_SERVICE, "number"/"message") are
 *     assumptions based on typical HA notify-style integrations and WILL
 *     need to be corrected to match whatever ha-whatsapp actually registers
 *     once you check Developer Tools -> Actions in your HA instance.
 *   - ensureSession()/getSessionStatus() cannot truly provision a NEW
 *     per-user session over HTTP the way WAHA can - ha-whatsapp is one
 *     session per HA instance. This method just checks whether that HA
 *     instance is reachable and reports "connected"/"error"; it does not
 *     create a fresh session per WhatsApp number. If you need true
 *     multi-session support, use the WAHA gateway for additional numbers
 *     and reserve ha-whatsapp for a single "primary" number tied to your HA
 *     box, or run one HA instance per user.
 *
 * Fix the TODOs below once you've confirmed the real service/entity names,
 * then this class is a drop-in replacement for WahaGateway per-number.
 */
export class HaWhatsappGateway implements WhatsAppGateway {
  readonly kind = "ha-whatsapp";
  private http: AxiosInstance;
  private service: string;

  constructor(baseUrl: string, longLivedToken: string, service: string) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ""),
      headers: { Authorization: `Bearer ${longLivedToken}`, "Content-Type": "application/json" },
      validateStatus: () => true,
      timeout: 20000,
    });
    this.service = service; // e.g. "whatsapp.send_message" - TODO confirm exact domain.service
  }

  async ensureSession(_sessionId: string): Promise<SessionEnsureResult> {
    // ha-whatsapp sessions are paired manually via the HA config flow UI
    // (Settings -> Devices & Services -> ha-whatsapp -> scan QR). We can only
    // report reachability here, not provision a new session.
    const res = await this.http.get(`/api/`);
    if (res.status >= 200 && res.status < 300) {
      return { status: "connected", message: "ha-whatsapp session is managed via the Home Assistant UI, not this API." };
    }
    return { status: "error", message: `Home Assistant unreachable (${res.status})` };
  }

  async getSessionStatus(sessionId: string): Promise<SessionEnsureResult> {
    return this.ensureSession(sessionId);
  }

  async startTyping(_sessionId: string, _recipient: string): Promise<void> {
    // TODO: ha-whatsapp does not currently document a typing-indicator
    // service. No-op until confirmed.
  }

  async stopTyping(_sessionId: string, _recipient: string): Promise<void> {
    // TODO: see startTyping.
  }

  async sendText(_sessionId: string, recipient: string, text: string): Promise<boolean> {
    const [domain, service] = this.service.split(".");
    const res = await this.http.post(`/api/services/${domain}/${service}`, {
      // TODO: confirm the real payload shape in HA Developer Tools -> Actions
      // for the ha-whatsapp integration. Common alternatives: "target"/"data"
      // wrapper (like notify.*), or "phone" instead of "number".
      number: recipient,
      message: text,
    });
    return res.status >= 200 && res.status < 300;
  }
}
