import { google, sheets_v4 } from "googleapis";
import { StorageAdapter } from "./StorageAdapter";
import { User, WhatsAppNumber, Reminder, FooterTemplate } from "../types";

/**
 * Google Sheets backend. Everything lives in ONE spreadsheet (so a single
 * GOOGLE_SHEETS_SPREADSHEET_ID env var is enough), split across tabs:
 *   Users | Numbers | Reminders | Templates
 * Every row is tagged with the owning user_id, mirroring the multi-tenant
 * Postgres schema. This keeps the two backends interchangeable and lets you
 * run both at once via MultiStorage without them drifting apart in shape.
 *
 * This is intentionally simple (full-sheet reads + appendRow), matching the
 * original Apps Script's style. It's fine for the reminder volumes this app
 * is built for; if you outgrow it, switch STORAGE_BACKENDS to "postgres".
 */

const TABS = {
  users: "Users",
  numbers: "Numbers",
  reminders: "Reminders",
  templates: "Templates",
};

const HEADERS: Record<string, string[]> = {
  [TABS.users]: ["id", "email", "display_name", "api_key", "created_at"],
  [TABS.numbers]: ["id", "user_id", "label", "phone_number", "gateway", "session_id", "status", "created_at"],
  [TABS.reminders]: [
    "id", "user_id", "number_id", "recipient", "message", "trigger_at", "recurring", "frequency",
    "template_id", "status", "days_left", "created_at", "sent_at", "moved_to_done",
  ],
  [TABS.templates]: ["id", "user_id", "name", "body", "is_default"],
};

export class SheetsAdapter implements StorageAdapter {
  readonly name = "sheets";
  private api!: sheets_v4.Sheets;
  private spreadsheetId: string;
  private keyFile: string;

  constructor(spreadsheetId: string, keyFile: string) {
    this.spreadsheetId = spreadsheetId;
    this.keyFile = keyFile;
  }

  async init(): Promise<void> {
    const auth = new google.auth.GoogleAuth({
      keyFile: this.keyFile,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    this.api = google.sheets({ version: "v4", auth });
    await this.ensureTabsAndHeaders();
  }

  private async ensureTabsAndHeaders() {
    const meta = await this.api.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const existing = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));

    const missing = Object.values(TABS).filter((t) => !existing.has(t));
    if (missing.length) {
      await this.api.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
      });
    }
    for (const tab of Object.values(TABS)) {
      await this.api.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADERS[tab]] },
      });
    }
  }

  private async readTab(tab: string): Promise<{ header: string[]; rows: any[][] }> {
    const res = await this.api.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${tab}!A1:Z100000`,
    });
    const values = res.data.values ?? [];
    const [header, ...rows] = values.length ? values : [HEADERS[tab]];
    return { header, rows };
  }

  private toObjects(header: string[], rows: any[][]): Record<string, any>[] {
    return rows
      .filter((r) => r.length > 0 && r[0])
      .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
  }

  private async appendRow(tab: string, obj: Record<string, any>) {
    const header = HEADERS[tab];
    const row = header.map((h) => (obj[h] === null || obj[h] === undefined ? "" : String(obj[h])));
    await this.api.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
  }

  private async updateRowById(tab: string, id: string, obj: Record<string, any>) {
    const { header, rows } = await this.readTab(tab);
    const idIdx = header.indexOf("id");
    const rowIdx = rows.findIndex((r) => r[idIdx] === id);
    if (rowIdx === -1) throw new Error(`${tab}: row with id ${id} not found`);
    const rowNumber = rowIdx + 2; // +1 header, +1 1-indexed
    const row = header.map((h) => (obj[h] === null || obj[h] === undefined ? "" : String(obj[h])));
    await this.api.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${tab}!A${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
  }

  // --- Users ---
  async createUser(user: User): Promise<void> {
    await this.appendRow(TABS.users, {
      id: user.id, email: user.email, display_name: user.displayName, api_key: user.apiKey, created_at: user.createdAt,
    });
  }
  async getUserById(id: string): Promise<User | null> {
    const users = await this.listUsers();
    return users.find((u) => u.id === id) ?? null;
  }
  async getUserByApiKey(apiKey: string): Promise<User | null> {
    const users = await this.listUsers();
    return users.find((u) => u.apiKey === apiKey) ?? null;
  }
  async getUserByEmail(email: string): Promise<User | null> {
    const users = await this.listUsers();
    return users.find((u) => u.email === email) ?? null;
  }
  async listUsers(): Promise<User[]> {
    const { header, rows } = await this.readTab(TABS.users);
    return this.toObjects(header, rows).map((o) => ({
      id: o.id, email: o.email, displayName: o.display_name, apiKey: o.api_key, createdAt: o.created_at,
    }));
  }

  // --- Numbers ---
  async createNumber(num: WhatsAppNumber): Promise<void> {
    await this.appendRow(TABS.numbers, {
      id: num.id, user_id: num.userId, label: num.label, phone_number: num.phoneNumber,
      gateway: num.gateway, session_id: num.sessionId, status: num.status, created_at: num.createdAt,
    });
  }
  async updateNumber(num: WhatsAppNumber): Promise<void> {
    await this.updateRowById(TABS.numbers, num.id, {
      id: num.id, user_id: num.userId, label: num.label, phone_number: num.phoneNumber,
      gateway: num.gateway, session_id: num.sessionId, status: num.status, created_at: num.createdAt,
    });
  }
  async getNumberById(id: string): Promise<WhatsAppNumber | null> {
    const { header, rows } = await this.readTab(TABS.numbers);
    const o = this.toObjects(header, rows).find((x) => x.id === id);
    return o ? this.objToNumber(o) : null;
  }
  async listNumbersForUser(userId: string): Promise<WhatsAppNumber[]> {
    const { header, rows } = await this.readTab(TABS.numbers);
    return this.toObjects(header, rows).filter((o) => o.user_id === userId).map((o) => this.objToNumber(o));
  }
  private objToNumber(o: any): WhatsAppNumber {
    return {
      id: o.id, userId: o.user_id, label: o.label, phoneNumber: o.phone_number,
      gateway: o.gateway, sessionId: o.session_id, status: o.status, createdAt: o.created_at,
    };
  }

  // --- Reminders ---
  async createReminder(reminder: Reminder): Promise<void> {
    await this.appendRow(TABS.reminders, this.reminderToObj(reminder));
  }
  async updateReminder(reminder: Reminder): Promise<void> {
    await this.updateRowById(TABS.reminders, reminder.id, this.reminderToObj(reminder));
  }
  async getReminderById(id: string): Promise<Reminder | null> {
    const { header, rows } = await this.readTab(TABS.reminders);
    const o = this.toObjects(header, rows).find((x) => x.id === id);
    return o ? this.objToReminder(o) : null;
  }
  async listDueReminders(now: Date): Promise<Reminder[]> {
    const { header, rows } = await this.readTab(TABS.reminders);
    return this.toObjects(header, rows)
      .map((o) => this.objToReminder(o))
      .filter((r) => r.status === "pending" && new Date(r.triggerAt).getTime() <= now.getTime());
  }
  async listRemindersForUser(userId: string): Promise<Reminder[]> {
    const { header, rows } = await this.readTab(TABS.reminders);
    return this.toObjects(header, rows).filter((o) => o.user_id === userId).map((o) => this.objToReminder(o));
  }
  async moveDoneReminders(): Promise<number> {
    // Sheets tab-based archival (mirrors the original "Move to Done" script):
    // rows with status=sent & recurring=false get flagged moved_to_done.
    const { header, rows } = await this.readTab(TABS.reminders);
    const objs = this.toObjects(header, rows);
    let count = 0;
    for (const o of objs) {
      if (o.status === "sent" && String(o.moved_to_done) !== "true" && String(o.recurring) !== "true") {
        const r = this.objToReminder(o);
        r.movedToDone = true;
        await this.updateReminder(r);
        count++;
      }
    }
    return count;
  }
  private reminderToObj(r: Reminder): Record<string, any> {
    return {
      id: r.id, user_id: r.userId, number_id: r.numberId, recipient: r.recipient, message: r.message,
      trigger_at: r.triggerAt, recurring: r.recurring, frequency: r.frequency, template_id: r.templateId ?? "",
      status: r.status, days_left: r.daysLeft ?? "", created_at: r.createdAt, sent_at: r.sentAt ?? "",
      moved_to_done: r.movedToDone,
    };
  }
  private objToReminder(o: any): Reminder {
    return {
      id: o.id, userId: o.user_id, numberId: o.number_id, recipient: o.recipient, message: o.message,
      triggerAt: o.trigger_at, recurring: String(o.recurring) === "true", frequency: o.frequency || "none",
      templateId: o.template_id || null, status: o.status || "pending",
      daysLeft: o.days_left === "" ? null : Number(o.days_left), createdAt: o.created_at,
      sentAt: o.sent_at || null, movedToDone: String(o.moved_to_done) === "true",
    };
  }

  // --- Templates ---
  async upsertTemplate(template: FooterTemplate): Promise<void> {
    const existing = await this.getTemplateById(template.id);
    const obj = {
      id: template.id, user_id: template.userId, name: template.name, body: template.body,
      is_default: template.isDefault,
    };
    if (existing) {
      await this.updateRowById(TABS.templates, template.id, obj);
    } else {
      await this.appendRow(TABS.templates, obj);
    }
  }
  private async getTemplateById(id: string): Promise<FooterTemplate | null> {
    const { header, rows } = await this.readTab(TABS.templates);
    const o = this.toObjects(header, rows).find((x) => x.id === id);
    return o ? this.objToTemplate(o) : null;
  }
  async getDefaultTemplateForUser(userId: string): Promise<FooterTemplate | null> {
    const list = await this.listTemplatesForUser(userId);
    return list.find((t) => t.isDefault) ?? null;
  }
  async listTemplatesForUser(userId: string): Promise<FooterTemplate[]> {
    const { header, rows } = await this.readTab(TABS.templates);
    return this.toObjects(header, rows).filter((o) => o.user_id === userId).map((o) => this.objToTemplate(o));
  }
  private objToTemplate(o: any): FooterTemplate {
    return { id: o.id, userId: o.user_id, name: o.name, body: o.body, isDefault: String(o.is_default) === "true" };
  }
}
