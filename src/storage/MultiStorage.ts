import { StorageAdapter } from "./StorageAdapter";
import { User, WhatsAppNumber, Reminder, FooterTemplate } from "../types";

/**
 * Fans writes out to every configured backend and reads from the first
 * ("primary") one. This is what powers STORAGE_BACKENDS=postgres,sheets -
 * Postgres stays the fast source of truth for the scheduler and API, while
 * every change is mirrored into the shared Google Sheet so it stays a live,
 * human-editable view (and vice versa, if you flip the primary).
 *
 * Note: this is best-effort dual-write, not a distributed transaction. If a
 * secondary backend write fails, it's logged but does not fail the request -
 * the primary backend remains authoritative.
 */
export class MultiStorage implements StorageAdapter {
  readonly name = "multi";
  private primary: StorageAdapter;
  private secondaries: StorageAdapter[];

  constructor(backends: StorageAdapter[]) {
    if (backends.length === 0) throw new Error("MultiStorage requires at least one backend");
    [this.primary, ...this.secondaries] = backends;
  }

  private async fanOut(fn: (a: StorageAdapter) => Promise<void>) {
    for (const s of this.secondaries) {
      try {
        await fn(s);
      } catch (err) {
        console.error(`[MultiStorage] secondary backend "${s.name}" write failed:`, err);
      }
    }
  }

  async init(): Promise<void> {
    await this.primary.init();
    for (const s of this.secondaries) await s.init();
  }

  async createUser(user: User): Promise<void> {
    await this.primary.createUser(user);
    await this.fanOut((a) => a.createUser(user));
  }
  getUserById(id: string) { return this.primary.getUserById(id); }
  getUserByApiKey(apiKey: string) { return this.primary.getUserByApiKey(apiKey); }
  getUserByEmail(email: string) { return this.primary.getUserByEmail(email); }
  listUsers() { return this.primary.listUsers(); }

  async createNumber(num: WhatsAppNumber): Promise<void> {
    await this.primary.createNumber(num);
    await this.fanOut((a) => a.createNumber(num));
  }
  async updateNumber(num: WhatsAppNumber): Promise<void> {
    await this.primary.updateNumber(num);
    await this.fanOut((a) => a.updateNumber(num));
  }
  getNumberById(id: string) { return this.primary.getNumberById(id); }
  listNumbersForUser(userId: string) { return this.primary.listNumbersForUser(userId); }

  async createReminder(reminder: Reminder): Promise<void> {
    await this.primary.createReminder(reminder);
    await this.fanOut((a) => a.createReminder(reminder));
  }
  async updateReminder(reminder: Reminder): Promise<void> {
    await this.primary.updateReminder(reminder);
    await this.fanOut((a) => a.updateReminder(reminder));
  }
  getReminderById(id: string) { return this.primary.getReminderById(id); }
  listDueReminders(now: Date) { return this.primary.listDueReminders(now); }
  listRemindersForUser(userId: string) { return this.primary.listRemindersForUser(userId); }
  async moveDoneReminders(): Promise<number> {
    const count = await this.primary.moveDoneReminders();
    await this.fanOut((a) => a.moveDoneReminders().then(() => undefined));
    return count;
  }

  async upsertTemplate(template: FooterTemplate): Promise<void> {
    await this.primary.upsertTemplate(template);
    await this.fanOut((a) => a.upsertTemplate(template));
  }
  getDefaultTemplateForUser(userId: string) { return this.primary.getDefaultTemplateForUser(userId); }
  listTemplatesForUser(userId: string) { return this.primary.listTemplatesForUser(userId); }
}
