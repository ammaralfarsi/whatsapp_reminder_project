/**
 * Common interface every WhatsApp transport must implement. The rest of the
 * app (session manager, scheduler, API) only ever talks to this interface,
 * so adding a third gateway later (Twilio, Baileys direct, ...) means
 * writing one new file, nothing else changes.
 */
export interface SessionEnsureResult {
  status: "connected" | "qr" | "pending" | "error";
  qrImageBase64?: string; // data URL or base64 PNG, when status === "qr"
  message?: string;
}

export interface WhatsAppGateway {
  readonly kind: string;

  /** Create the session if it doesn't exist yet, and start it. */
  ensureSession(sessionId: string, meta?: Record<string, string>): Promise<SessionEnsureResult>;

  /** Poll current session status / QR without creating anything. */
  getSessionStatus(sessionId: string): Promise<SessionEnsureResult>;

  startTyping(sessionId: string, recipient: string): Promise<void>;
  stopTyping(sessionId: string, recipient: string): Promise<void>;

  /** Send a text message. Returns true on success. */
  sendText(sessionId: string, recipient: string, text: string): Promise<boolean>;
}
