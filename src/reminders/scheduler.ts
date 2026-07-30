import * as cron from "node-cron";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { StorageAdapter } from "../storage/StorageAdapter";
import { TemplateService } from "./templates";
import { getGateway } from "../gateways";
import { Reminder, RecurrenceFrequency, WhatsAppNumber } from "../types";
import { config } from "../config";

/**
 * The heart of the app - ports sendReminders() from the original Apps
 * Script, generalized to run across every user and every number instead of
 * one hardcoded session. Runs on a cron schedule (SCHEDULER_CRON, default
 * every minute) rather than a single Apps Script time trigger.
 */
export class Scheduler {
  private templates: TemplateService;

  // In-memory debounce so a session stuck disconnected doesn't fire the HA
  // webhook on every single cron tick (default: every minute) - resets on
  // restart, which just means one extra notification after a deploy/restart,
  // not a real problem. Keyed by number id -> last notified timestamp (ms).
  private sessionDownNotifiedAt = new Map<string, number>();
  private static readonly SESSION_DOWN_RENOTIFY_MS = 30 * 60 * 1000; // 30 min

  constructor(private storage: StorageAdapter) {
    this.templates = new TemplateService(storage);
  }

  start() {
    console.log(`[scheduler] starting with cron "${config.schedulerCron}"`);
    cron.schedule(config.schedulerCron, () => {
      this.tick().catch((err) => console.error("[scheduler] tick failed:", err));
    });
  }

  async tick() {
    const now = new Date();
    const due = await this.storage.listDueReminders(now);
    if (due.length === 0) return;

    console.log(`[scheduler] ${due.length} reminder(s) due`);
    for (const reminder of due) {
      try {
        await this.processReminder(reminder);
      } catch (err) {
        console.error(`[scheduler] failed to process reminder ${reminder.id}:`, err);
        reminder.status = "error";
        await this.storage.updateReminder(reminder).catch(() => undefined);
      }
    }

    await this.storage.moveDoneReminders().catch((err) => console.error("[scheduler] moveDoneReminders failed:", err));
  }

  /** Sends a reminder right away, ignoring its scheduled triggerAt - the
   * "Send now" button in reminder.html. Reuses the exact same send path the
   * cron tick uses (typing indicator, template rendering, HA webhook,
   * recurrence), so the outcome (sent/error, next occurrence if recurring)
   * is identical either way. */
  async sendNow(reminderId: string): Promise<Reminder> {
    const reminder = await this.storage.getReminderById(reminderId);
    if (!reminder) throw new Error("Reminder not found");
    await this.processReminder(reminder);
    return (await this.storage.getReminderById(reminderId)) ?? reminder;
  }

  private async processReminder(reminder: Reminder) {
    const number = await this.storage.getNumberById(reminder.numberId);
    if (!number) {
      console.warn(`[scheduler] reminder ${reminder.id} references missing number ${reminder.numberId}, skipping`);
      return;
    }

    const gw = getGateway(number.gateway);

    // number.status is only ever refreshed when someone has the QR/status
    // page open polling it (see SessionManager.getQr) - if a session
    // actually connects but nobody's watching at that exact moment (tab
    // closed right after scanning, browser refresh, etc.), that cached
    // field can be stuck on "qr"/"pending" indefinitely even though the
    // gateway is really connected, silently blocking every reminder on that
    // number forever. Check the gateway's live status here instead of
    // trusting the cache, and correct the stored value if it drifted.
    const live = await gw.getSessionStatus(number.sessionId).catch(() => null);
    const liveStatus = live?.status === "connected" ? "connected" : live?.status === "qr" ? "qr" : live?.status === "error" ? "error" : "pending";
    if (liveStatus !== number.status) {
      number.status = liveStatus;
      await this.storage.updateNumber(number).catch(() => undefined);
    }
    if (liveStatus !== "connected") {
      console.warn(`[scheduler] number ${number.id} (session ${number.sessionId}) is not connected (live status=${liveStatus}), skipping reminder ${reminder.id}`);
      await this.notifySessionDown(number, liveStatus);
      return;
    }

    const template = reminder.templateId
      ? (await this.storage.listTemplatesForUser(reminder.userId)).find((t) => t.id === reminder.templateId) ?? null
      : await this.templates.ensureUserDefault(reminder.userId);

    const finalText = await this.templates.render(reminder, template);

    await gw.startTyping(number.sessionId, reminder.recipient).catch(() => undefined);
    await sleep(config.typingDelayMs);
    await gw.stopTyping(number.sessionId, reminder.recipient).catch(() => undefined);

    const sent = await gw.sendText(number.sessionId, reminder.recipient, finalText);

    if (!sent) {
      reminder.status = "error";
      await this.storage.updateReminder(reminder);
      return;
    }

    reminder.status = "sent";
    reminder.sentAt = new Date().toISOString();
    await this.storage.updateReminder(reminder);

    await this.notifyHomeAssistant(reminder.recipient, reminder.message);

    if (reminder.recurring && reminder.frequency !== "none") {
      const next: Reminder = {
        ...reminder,
        id: uuidv4(),
        triggerAt: nextTriggerDate(new Date(reminder.triggerAt), reminder.frequency).toISOString(),
        status: "pending",
        sentAt: null,
        movedToDone: false,
        createdAt: new Date().toISOString(),
      };
      await this.storage.createReminder(next);
    }
  }

  private async notifyHomeAssistant(recipient: string, message: string) {
    if (!config.haNotifyWebhookUrl) return;
    try {
      await axios.post(config.haNotifyWebhookUrl, { event: "reminder_sent", recipient, message }, { timeout: 10000 });
    } catch (err) {
      console.error("[scheduler] Home Assistant webhook notify failed:", err);
    }
  }

  /** Fires the same HA webhook used for successful sends, but with
   * event: "session_down", so a reminder silently going nowhere because the
   * WhatsApp session dropped doesn't go unnoticed until someone happens to
   * open the app. Debounced per-number so a long-dead session doesn't spam
   * the webhook every cron tick. */
  private async notifySessionDown(number: WhatsAppNumber, liveStatus: string) {
    if (!config.haNotifyWebhookUrl) return;
    const last = this.sessionDownNotifiedAt.get(number.id) ?? 0;
    const now = Date.now();
    if (now - last < Scheduler.SESSION_DOWN_RENOTIFY_MS) return;
    this.sessionDownNotifiedAt.set(number.id, now);

    const message = `⚠️ WhatsApp number "${number.label}" (${number.phoneNumber}) is ${liveStatus === "qr" ? "waiting for QR scan" : liveStatus}, not connected - a reminder was skipped. Reconnect it from Settings / the Numbers page.`;
    try {
      await axios.post(config.haNotifyWebhookUrl, { event: "session_down", numberId: number.id, numberLabel: number.label, status: liveStatus, message }, { timeout: 10000 });
    } catch (err) {
      console.error("[scheduler] session-down webhook notify failed:", err);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextTriggerDate(date: Date, frequency: RecurrenceFrequency): Date {
  const next = new Date(date);
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1); // calendar-correct, unlike the original's "+30 days"
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}
