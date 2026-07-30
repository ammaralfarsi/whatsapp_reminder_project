import { StorageAdapter } from "./StorageAdapter";
import { User, WhatsAppNumber, Reminder, FooterTemplate } from "../types";

/**
 * Forwards every call to whatever storage adapter `getCurrent()` returns at
 * that moment. See src/storage/index.ts - `liveStorage` is the one instance
 * handed to createServer() and the Scheduler at boot, so when the Settings
 * page swaps which backend(s) are active (reloadStorage()), every route and
 * the scheduler pick up the change on their next call, with no restart.
 */
export class LiveStorage implements StorageAdapter {
  readonly name = "live";
  constructor(private getCurrent: () => Promise<StorageAdapter>) {}

  async init(): Promise<void> {
    await this.getCurrent();
  }

  async createUser(user: User) { return (await this.getCurrent()).createUser(user); }
  async getUserById(id: string) { return (await this.getCurrent()).getUserById(id); }
  async getUserByApiKey(apiKey: string) { return (await this.getCurrent()).getUserByApiKey(apiKey); }
  async getUserByEmail(email: string) { return (await this.getCurrent()).getUserByEmail(email); }
  async getUserByHaUserId(haUserId: string) { return (await this.getCurrent()).getUserByHaUserId(haUserId); }
  async listUsers() { return (await this.getCurrent()).listUsers(); }
  async updateUser(user: User) { return (await this.getCurrent()).updateUser(user); }

  async createNumber(num: WhatsAppNumber) { return (await this.getCurrent()).createNumber(num); }
  async updateNumber(num: WhatsAppNumber) { return (await this.getCurrent()).updateNumber(num); }
  async getNumberById(id: string) { return (await this.getCurrent()).getNumberById(id); }
  async listNumbersForUser(userId: string) { return (await this.getCurrent()).listNumbersForUser(userId); }

  async createReminder(reminder: Reminder) { return (await this.getCurrent()).createReminder(reminder); }
  async updateReminder(reminder: Reminder) { return (await this.getCurrent()).updateReminder(reminder); }
  async deleteReminder(id: string) { return (await this.getCurrent()).deleteReminder(id); }
  async getReminderById(id: string) { return (await this.getCurrent()).getReminderById(id); }
  async listDueReminders(now: Date) { return (await this.getCurrent()).listDueReminders(now); }
  async listRemindersForUser(userId: string) { return (await this.getCurrent()).listRemindersForUser(userId); }
  async moveDoneReminders() { return (await this.getCurrent()).moveDoneReminders(); }

  async upsertTemplate(template: FooterTemplate) { return (await this.getCurrent()).upsertTemplate(template); }
  async getDefaultTemplateForUser(userId: string) { return (await this.getCurrent()).getDefaultTemplateForUser(userId); }
  async listTemplatesForUser(userId: string) { return (await this.getCurrent()).listTemplatesForUser(userId); }
}
