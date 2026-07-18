import { Pool } from "pg";
import { StorageAdapter } from "./StorageAdapter";
import { User, WhatsAppNumber, Reminder, FooterTemplate } from "../types";

export class PostgresAdapter implements StorageAdapter {
  readonly name = "postgres";
  private pool: Pool;

  constructor(connectionString: string, ssl: boolean) {
    this.pool = new Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
    });
  }

  async init(): Promise<void> {
    // Schema is applied via migrations/001_init.sql (docker-entrypoint-initdb.d
    // for the bundled Postgres image, or `npm run migrate` for external DBs).
    await this.pool.query("SELECT 1");
  }

  // --- Users ---
  async createUser(user: User): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (id, email, display_name, api_key, created_at) VALUES ($1,$2,$3,$4,$5)`,
      [user.id, user.email, user.displayName, user.apiKey, user.createdAt]
    );
  }

  async getUserById(id: string): Promise<User | null> {
    const r = await this.pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
    return r.rows[0] ? rowToUser(r.rows[0]) : null;
  }

  async getUserByApiKey(apiKey: string): Promise<User | null> {
    const r = await this.pool.query(`SELECT * FROM users WHERE api_key = $1`, [apiKey]);
    return r.rows[0] ? rowToUser(r.rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const r = await this.pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
    return r.rows[0] ? rowToUser(r.rows[0]) : null;
  }

  async listUsers(): Promise<User[]> {
    const r = await this.pool.query(`SELECT * FROM users ORDER BY created_at`);
    return r.rows.map(rowToUser);
  }

  // --- Numbers ---
  async createNumber(num: WhatsAppNumber): Promise<void> {
    await this.pool.query(
      `INSERT INTO whatsapp_numbers (id, user_id, label, phone_number, gateway, session_id, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [num.id, num.userId, num.label, num.phoneNumber, num.gateway, num.sessionId, num.status, num.createdAt]
    );
  }

  async updateNumber(num: WhatsAppNumber): Promise<void> {
    await this.pool.query(
      `UPDATE whatsapp_numbers SET label=$2, phone_number=$3, gateway=$4, session_id=$5, status=$6 WHERE id=$1`,
      [num.id, num.label, num.phoneNumber, num.gateway, num.sessionId, num.status]
    );
  }

  async getNumberById(id: string): Promise<WhatsAppNumber | null> {
    const r = await this.pool.query(`SELECT * FROM whatsapp_numbers WHERE id = $1`, [id]);
    return r.rows[0] ? rowToNumber(r.rows[0]) : null;
  }

  async listNumbersForUser(userId: string): Promise<WhatsAppNumber[]> {
    const r = await this.pool.query(`SELECT * FROM whatsapp_numbers WHERE user_id = $1 ORDER BY created_at`, [userId]);
    return r.rows.map(rowToNumber);
  }

  // --- Reminders ---
  async createReminder(reminder: Reminder): Promise<void> {
    await this.pool.query(
      `INSERT INTO reminders (id, user_id, number_id, recipient, message, trigger_at, recurring, frequency, template_id, status, days_left, created_at, sent_at, moved_to_done)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        reminder.id, reminder.userId, reminder.numberId, reminder.recipient, reminder.message,
        reminder.triggerAt, reminder.recurring, reminder.frequency, reminder.templateId,
        reminder.status, reminder.daysLeft, reminder.createdAt, reminder.sentAt, reminder.movedToDone,
      ]
    );
  }

  async updateReminder(reminder: Reminder): Promise<void> {
    await this.pool.query(
      `UPDATE reminders SET recipient=$2, message=$3, trigger_at=$4, recurring=$5, frequency=$6,
         template_id=$7, status=$8, days_left=$9, sent_at=$10, moved_to_done=$11 WHERE id=$1`,
      [
        reminder.id, reminder.recipient, reminder.message, reminder.triggerAt, reminder.recurring,
        reminder.frequency, reminder.templateId, reminder.status, reminder.daysLeft, reminder.sentAt,
        reminder.movedToDone,
      ]
    );
  }

  async getReminderById(id: string): Promise<Reminder | null> {
    const r = await this.pool.query(`SELECT * FROM reminders WHERE id = $1`, [id]);
    return r.rows[0] ? rowToReminder(r.rows[0]) : null;
  }

  async listDueReminders(now: Date): Promise<Reminder[]> {
    const r = await this.pool.query(
      `SELECT * FROM reminders WHERE status = 'pending' AND trigger_at <= $1 ORDER BY trigger_at`,
      [now.toISOString()]
    );
    return r.rows.map(rowToReminder);
  }

  async listRemindersForUser(userId: string): Promise<Reminder[]> {
    const r = await this.pool.query(`SELECT * FROM reminders WHERE user_id = $1 ORDER BY trigger_at DESC`, [userId]);
    return r.rows.map(rowToReminder);
  }

  async moveDoneReminders(): Promise<number> {
    // "Done" reminders are simply flagged; a lightweight archive table isn't
    // necessary in Postgres (unlike the Sheets tab-based model) since we can
    // just filter status = 'done' everywhere. Kept for interface parity.
    const r = await this.pool.query(
      `UPDATE reminders SET moved_to_done = true WHERE status = 'sent' AND moved_to_done = false AND recurring = false RETURNING id`
    );
    return r.rowCount ?? 0;
  }

  // --- Templates ---
  async upsertTemplate(template: FooterTemplate): Promise<void> {
    if (template.isDefault) {
      await this.pool.query(`UPDATE footer_templates SET is_default = false WHERE user_id = $1`, [template.userId]);
    }
    await this.pool.query(
      `INSERT INTO footer_templates (id, user_id, name, body, is_default) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET name=$3, body=$4, is_default=$5`,
      [template.id, template.userId, template.name, template.body, template.isDefault]
    );
  }

  async getDefaultTemplateForUser(userId: string): Promise<FooterTemplate | null> {
    const r = await this.pool.query(
      `SELECT * FROM footer_templates WHERE user_id = $1 AND is_default = true LIMIT 1`,
      [userId]
    );
    return r.rows[0] ? rowToTemplate(r.rows[0]) : null;
  }

  async listTemplatesForUser(userId: string): Promise<FooterTemplate[]> {
    const r = await this.pool.query(`SELECT * FROM footer_templates WHERE user_id = $1`, [userId]);
    return r.rows.map(rowToTemplate);
  }
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    apiKey: row.api_key,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function rowToNumber(row: any): WhatsAppNumber {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    phoneNumber: row.phone_number,
    gateway: row.gateway,
    sessionId: row.session_id,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function rowToReminder(row: any): Reminder {
  return {
    id: row.id,
    userId: row.user_id,
    numberId: row.number_id,
    recipient: row.recipient,
    message: row.message,
    triggerAt: new Date(row.trigger_at).toISOString(),
    recurring: row.recurring,
    frequency: row.frequency,
    templateId: row.template_id,
    status: row.status,
    daysLeft: row.days_left,
    createdAt: new Date(row.created_at).toISOString(),
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    movedToDone: row.moved_to_done,
  };
}

function rowToTemplate(row: any): FooterTemplate {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    body: row.body,
    isDefault: row.is_default,
  };
}
