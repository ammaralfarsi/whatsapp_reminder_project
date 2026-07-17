import * as cron from "node-cron";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { StorageAdapter } from "../storage/StorageAdapter";
import { TemplateService } from "./templates";
import { getGateway } from "../gateways";
import { Reminder, RecurrenceFrequency } from "../types";
import { config } from "../config";

/**
 * The heart of the app - ports sendReminders() from the original Apps
 * Script, generalized to run across every user and every number instead of
 * one hardcoded session. Runs on a cron schedule (SCHEDULER_CRON, default
 * every minute) rather than a single Apps Script time trigger.
 */
export class Scheduler {
  private templates: TemplateService;

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

  private async processReminder(reminder: Reminder) {
    const number = await this.storage.getNumberById(reminder.numberId);
    if (!number) {
      console.warn(`[scheduler] reminder ${reminder.id} references missing number ${reminder.numberId}, skipping`);
      return;
    }
    if (number.status !== "connected") {
      console.warn(`[scheduler] number ${number.id} (session ${number.sessionId}) is not connected (status=${number.status}), skipping reminder ${reminder.id}`);
      return;
    }

    const gw = getGateway(number.gateway);

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
      await axios.post(config.haNotifyWebhookUrl, { recipient, message }, { timeout: 10000 });
    } catch (err) {
      console.error("[scheduler] Home Assistant webhook notify failed:", err);
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
