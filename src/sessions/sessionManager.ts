import { v4 as uuidv4 } from "uuid";
import { StorageAdapter } from "../storage/StorageAdapter";
import { getGateway } from "../gateways";
import { GatewayKind, WhatsAppNumber } from "../types";

/**
 * Owns the "new phone number -> gateway session" rule: by default, adding a
 * WhatsApp number provisions a brand-new, isolated session on the chosen
 * gateway (a fresh WAHA session, or an ha-whatsapp pairing) - but the caller
 * can also pass an existing sessionId (e.g. picked from
 * WahaGateway.listSessions()) to attach the new number to a session that
 * already exists instead, rather than always creating one.
 */
export class SessionManager {
  constructor(private storage: StorageAdapter) {}

  private makeSessionId(userId: string, phoneNumber: string): string {
    // Deterministic, human-readable, still unique per user+number.
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    return `u${userId.slice(0, 8)}_${cleanPhone}`;
  }

  async addNumber(
    userId: string,
    label: string,
    phoneNumber: string,
    gateway: GatewayKind,
    existingSessionId?: string
  ): Promise<WhatsAppNumber> {
    const existing = await this.storage.listNumbersForUser(userId);
    if (existing.some((n) => n.phoneNumber === phoneNumber.replace(/\D/g, ""))) {
      throw new Error("This phone number is already registered for this user.");
    }

    const sessionId = existingSessionId?.trim() || this.makeSessionId(userId, phoneNumber);
    const number: WhatsAppNumber = {
      id: uuidv4(),
      userId,
      label,
      phoneNumber: phoneNumber.replace(/\D/g, ""),
      gateway,
      sessionId,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await this.storage.createNumber(number);

    // Kick off session creation immediately so the QR is ready to fetch.
    const gw = getGateway(gateway);
    const result = await gw.ensureSession(sessionId, { "user.id": userId, "number.label": label });
    number.status = result.status === "connected" ? "connected" : result.status === "qr" ? "qr" : result.status === "error" ? "error" : "pending";
    await this.storage.updateNumber(number);

    return number;
  }

  async getQr(numberId: string) {
    const number = await this.storage.getNumberById(numberId);
    if (!number) throw new Error("Number not found");
    const gw = getGateway(number.gateway);
    const result = await gw.getSessionStatus(number.sessionId);

    if (number.status !== result.status) {
      number.status = result.status === "connected" ? "connected" : result.status === "qr" ? "qr" : result.status === "error" ? "error" : "pending";
      await this.storage.updateNumber(number);
    }
    return result;
  }

  async refreshStatus(numberId: string) {
    return this.getQr(numberId);
  }
}
