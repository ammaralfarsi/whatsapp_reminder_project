import { User, WhatsAppNumber, Reminder, FooterTemplate } from "../types";

/**
 * Every storage backend (Postgres, Sheets, ...) implements this same
 * interface. The rest of the app (API routes, scheduler, session manager)
 * never talks to Postgres or Sheets directly - only to a StorageAdapter.
 * This is what makes it possible to run on Sheets only, Postgres only, or
 * both at once (see MultiStorage).
 */
export interface StorageAdapter {
  readonly name: string;

  init(): Promise<void>;

  // --- Users ---
  createUser(user: User): Promise<void>;
  getUserById(id: string): Promise<User | null>;
  getUserByApiKey(apiKey: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  listUsers(): Promise<User[]>;

  // --- WhatsApp numbers / sessions ---
  createNumber(num: WhatsAppNumber): Promise<void>;
  updateNumber(num: WhatsAppNumber): Promise<void>;
  getNumberById(id: string): Promise<WhatsAppNumber | null>;
  listNumbersForUser(userId: string): Promise<WhatsAppNumber[]>;

  // --- Reminders ---
  createReminder(reminder: Reminder): Promise<void>;
  updateReminder(reminder: Reminder): Promise<void>;
  getReminderById(id: string): Promise<Reminder | null>;
  listDueReminders(now: Date): Promise<Reminder[]>;
  listRemindersForUser(userId: string): Promise<Reminder[]>;
  moveDoneReminders(): Promise<number>; // returns count moved

  // --- Footer templates ---
  upsertTemplate(template: FooterTemplate): Promise<void>;
  getDefaultTemplateForUser(userId: string): Promise<FooterTemplate | null>;
  listTemplatesForUser(userId: string): Promise<FooterTemplate[]>;
}
