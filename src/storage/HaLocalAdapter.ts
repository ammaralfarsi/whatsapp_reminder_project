import fs from "fs";
import path from "path";
import { StorageAdapter } from "./StorageAdapter";
import { User, WhatsAppNumber, Reminder, FooterTemplate } from "../types";

interface DbShape {
  users: User[];
  numbers: WhatsAppNumber[];
  reminders: Reminder[];
  templates: FooterTemplate[];
}

function emptyDb(): DbShape {
  return { users: [], numbers: [], reminders: [], templates: [] };
}

/**
 * "Home Assistant local" storage: no external database, no Google account,
 * no API keys - just a JSON file living on disk under the add-on's own
 * persistent storage (or ./data in plain Docker/dev). This is the option
 * for "one household, a handful of reminders," picked from the Settings
 * page alongside (or instead of) Postgres/Sheets.
 *
 * Writes are serialized through a single promise chain so concurrent
 * requests can't interleave and corrupt the file.
 */
export class HaLocalAdapter implements StorageAdapter {
  readonly name = "ha_local";
  private filePath: string;
  private data: DbShape = emptyDb();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
        this.data = { ...emptyDb(), ...parsed };
      } catch (err) {
        console.error(`[ha_local] failed to parse ${this.filePath}, starting from an empty store:`, err);
        this.data = emptyDb();
      }
    } else {
      await this.persist();
    }
  }

  private persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const temporaryPath = `${this.filePath}.tmp`;
      await fs.promises.writeFile(temporaryPath, JSON.stringify(this.data, null, 2), { mode: 0o600 });
      await fs.promises.rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
  }

  // --- Users ---
  async createUser(user: User): Promise<void> {
    this.data.users.push(user);
    await this.persist();
  }
  async getUserById(id: string): Promise<User | null> {
    return this.data.users.find((u) => u.id === id) ?? null;
  }
  async getUserByApiKey(apiKey: string): Promise<User | null> {
    return this.data.users.find((u) => u.apiKey === apiKey) ?? null;
  }
  async getUserByEmail(email: string): Promise<User | null> {
    return this.data.users.find((u) => u.email === email) ?? null;
  }
  async getUserByHaUserId(haUserId: string): Promise<User | null> {
    return this.data.users.find((u) => u.haUserId === haUserId) ?? null;
  }
  async listUsers(): Promise<User[]> {
    return [...this.data.users];
  }
  async updateUser(user: User): Promise<void> {
    const i = this.data.users.findIndex((u) => u.id === user.id);
    if (i === -1) throw new Error(`ha_local: user ${user.id} not found`);
    this.data.users[i] = user;
    await this.persist();
  }

  // --- WhatsApp numbers ---
  async createNumber(num: WhatsAppNumber): Promise<void> {
    this.data.numbers.push(num);
    await this.persist();
  }
  async updateNumber(num: WhatsAppNumber): Promise<void> {
    const i = this.data.numbers.findIndex((n) => n.id === num.id);
    if (i === -1) throw new Error(`ha_local: number ${num.id} not found`);
    this.data.numbers[i] = num;
    await this.persist();
  }
  async getNumberById(id: string): Promise<WhatsAppNumber | null> {
    return this.data.numbers.find((n) => n.id === id) ?? null;
  }
  async listNumbersForUser(userId: string): Promise<WhatsAppNumber[]> {
    return this.data.numbers.filter((n) => n.userId === userId);
  }

  // --- Reminders ---
  async createReminder(reminder: Reminder): Promise<void> {
    this.data.reminders.push(reminder);
    await this.persist();
  }
  async updateReminder(reminder: Reminder): Promise<void> {
    const i = this.data.reminders.findIndex((r) => r.id === reminder.id);
    if (i === -1) throw new Error(`ha_local: reminder ${reminder.id} not found`);
    this.data.reminders[i] = reminder;
    await this.persist();
  }
  async deleteReminder(id: string): Promise<void> {
    this.data.reminders = this.data.reminders.filter((r) => r.id !== id);
    await this.persist();
  }
  async getReminderById(id: string): Promise<Reminder | null> {
    return this.data.reminders.find((r) => r.id === id) ?? null;
  }
  async listDueReminders(now: Date): Promise<Reminder[]> {
    return this.data.reminders.filter(
      (r) => r.status === "pending" && new Date(r.triggerAt).getTime() <= now.getTime()
    );
  }
  async listRemindersForUser(userId: string): Promise<Reminder[]> {
    return this.data.reminders.filter((r) => r.userId === userId);
  }
  async moveDoneReminders(): Promise<number> {
    let count = 0;
    for (const r of this.data.reminders) {
      if (r.status === "sent" && !r.movedToDone && !r.recurring) {
        r.movedToDone = true;
        count++;
      }
    }
    if (count) await this.persist();
    return count;
  }

  // --- Footer templates ---
  async upsertTemplate(template: FooterTemplate): Promise<void> {
    if (template.isDefault) {
      for (const other of this.data.templates) {
        if (other.userId === template.userId) other.isDefault = false;
      }
    }
    const i = this.data.templates.findIndex((t) => t.id === template.id);
    if (i === -1) this.data.templates.push(template);
    else this.data.templates[i] = template;
    await this.persist();
  }
  async getDefaultTemplateForUser(userId: string): Promise<FooterTemplate | null> {
    return this.data.templates.find((t) => t.userId === userId && t.isDefault) ?? null;
  }
  async listTemplatesForUser(userId: string): Promise<FooterTemplate[]> {
    return this.data.templates.filter((t) => t.userId === userId);
  }
}
