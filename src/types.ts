// Core domain types shared across storage adapters, gateways and the API.

export type GatewayKind = "waha" | "ha-whatsapp";

export interface User {
  id: string; // uuid
  email: string;
  displayName: string;
  apiKey: string; // per-user API key, used by the mobile app / HA / webhooks
  createdAt: string; // ISO timestamp
}

/**
 * A WhatsApp "number" a user has connected. Each number maps to exactly one
 * gateway session (e.g. one WAHA session). Adding a brand-new number for a
 * user always provisions a brand-new session - numbers are never shared
 * across sessions, even for the same user.
 */
export interface WhatsAppNumber {
  id: string; // uuid
  userId: string;
  label: string; // friendly name, e.g. "Personal", "Business"
  phoneNumber: string; // digits only, no + or spaces
  gateway: GatewayKind;
  sessionId: string; // gateway session name, e.g. WAHA session name
  status: "pending" | "qr" | "connected" | "disconnected" | "error";
  createdAt: string;
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly" | "none";

export interface Reminder {
  id: string; // uuid
  userId: string;
  numberId: string; // which of the user's WhatsAppNumber rows sends this
  recipient: string; // destination phone number (digits only)
  message: string;
  triggerAt: string; // ISO timestamp
  recurring: boolean;
  frequency: RecurrenceFrequency;
  templateId: string | null; // footer template override, null = user's default
  status: "pending" | "sent" | "error" | "done";
  daysLeft: number | null;
  createdAt: string;
  sentAt: string | null;
  movedToDone: boolean;
}

/**
 * A footer template lets each user customize (or disable) the text appended
 * to every outgoing reminder, e.g. the "~Auto Reminder~ ~تذكير تلقائي~" line
 * in the original script. Supports {{placeholders}}.
 */
export interface FooterTemplate {
  id: string;
  userId: string;
  name: string;
  body: string; // e.g. "\n\n~Auto Reminder~      ~تذكير تلقائي~"
  isDefault: boolean;
}

export interface OutboundMessage {
  gateway: GatewayKind;
  sessionId: string;
  recipient: string; // digits only
  text: string;
}
