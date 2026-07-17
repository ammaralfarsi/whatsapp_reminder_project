import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { StorageAdapter } from "../../storage/StorageAdapter";
import { requireUser, AuthedRequest } from "../../auth/apiKeyAuth";
import { Reminder, RecurrenceFrequency } from "../../types";

/**
 * CRUD for reminders, plus a payload shape compatible with both the old
 * Flutter app ("YYYY-MM-DD HH:mm:ss") and the Home Assistant script call
 * (ISO "triggerDateTime"/"dateTime") from the original doPost(). Point your
 * existing Flutter app and HA script.add_reminder_to_sheet at
 * POST /api/reminders instead of the old Apps Script web app URL, with the
 * user's X-Api-Key header - everything else about the payload stays the
 * same.
 */
export function remindersRouter(storage: StorageAdapter): Router {
  const router = Router();
  const auth = requireUser(storage);

  router.post("/reminders", auth, async (req: AuthedRequest, res) => {
    const body = req.body ?? {};
    const numberId: string | undefined = body.numberId;
    if (!numberId) return res.status(400).json({ error: "numberId is required (which of your WhatsApp numbers should send this)" });

    const number = await storage.getNumberById(numberId);
    if (!number || number.userId !== req.user!.id) return res.status(400).json({ error: "Unknown numberId for this user" });

    const recipient: string = String(body.recipient ?? "").replace(/\D/g, "");
    const message: string = body.message ?? "";
    if (!recipient || !message) return res.status(400).json({ error: "recipient and message are required" });

    const dateStr: string | undefined = body.triggerDateTime ?? body.dateTime ?? body.triggerAt;
    const triggerAt = parseFlexibleDate(dateStr);

    const recurrence = String(body.recurrence ?? body.recurring ?? "No").toLowerCase();
    const recurring = recurrence === "yes" || recurrence === "true";
    const frequency: RecurrenceFrequency = normalizeFrequency(body.frequency);

    const reminder: Reminder = {
      id: uuidv4(),
      userId: req.user!.id,
      numberId,
      recipient,
      message,
      triggerAt: triggerAt.toISOString(),
      recurring,
      frequency,
      templateId: body.templateId ?? null,
      status: "pending",
      daysLeft: null,
      createdAt: new Date().toISOString(),
      sentAt: null,
      movedToDone: false,
    };
    await storage.createReminder(reminder);
    res.status(201).json(reminder);
  });

  router.get("/reminders", auth, async (req: AuthedRequest, res) => {
    res.json(await storage.listRemindersForUser(req.user!.id));
  });

  router.get("/reminders/:id", auth, async (req: AuthedRequest, res) => {
    const reminder = await storage.getReminderById(req.params.id);
    if (!reminder || reminder.userId !== req.user!.id) return res.status(404).json({ error: "Not found" });
    res.json(reminder);
  });

  router.patch("/reminders/:id", auth, async (req: AuthedRequest, res) => {
    const reminder = await storage.getReminderById(req.params.id);
    if (!reminder || reminder.userId !== req.user!.id) return res.status(404).json({ error: "Not found" });

    const patch = req.body ?? {};
    Object.assign(reminder, {
      message: patch.message ?? reminder.message,
      recipient: patch.recipient ? String(patch.recipient).replace(/\D/g, "") : reminder.recipient,
      triggerAt: patch.triggerDateTime || patch.dateTime || patch.triggerAt ? parseFlexibleDate(patch.triggerDateTime ?? patch.dateTime ?? patch.triggerAt).toISOString() : reminder.triggerAt,
      status: patch.status ?? reminder.status,
    });
    await storage.updateReminder(reminder);
    res.json(reminder);
  });

  return router;
}

function parseFlexibleDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const sanitized = dateStr.replace(/'/g, "").trim();

  if (sanitized.includes("T")) {
    const iso = new Date(sanitized);
    if (!isNaN(iso.getTime())) return iso;
  }

  const isoLike = new Date(sanitized);
  if (!isNaN(isoLike.getTime())) return isoLike;

  // "DD/MM/YYYY HH:MM:SS" (original Apps Script format)
  const m = sanitized.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    const [, day, month, year, hour, minute, second] = m.map(Number);
    return new Date(year, month - 1, day, hour, minute, second);
  }

  // "YYYY-MM-DD HH:mm:ss" (Flutter format)
  const m2 = sanitized.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (m2) {
    const [, year, month, day, hour, minute, second] = m2.map(Number);
    return new Date(year, month - 1, day, hour, minute, second);
  }

  return new Date();
}

function normalizeFrequency(f: any): RecurrenceFrequency {
  const v = String(f ?? "none").toLowerCase();
  return (["daily", "weekly", "monthly", "yearly"].includes(v) ? v : "none") as RecurrenceFrequency;
}
