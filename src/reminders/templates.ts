import { v4 as uuidv4 } from "uuid";
import { StorageAdapter } from "../storage/StorageAdapter";
import { FooterTemplate, Reminder } from "../types";
import { config } from "../config";

/**
 * Footer templates let each user edit (or turn off) the line appended to
 * every outgoing reminder - the "~Auto Reminder~ ~تذكير تلقائي~" line in the
 * original script was hardcoded; here it's per-user and editable via the API
 * (PUT /api/templates), with simple {{placeholder}} support.
 */
export class TemplateService {
  constructor(private storage: StorageAdapter) {}

  async ensureUserDefault(userId: string): Promise<FooterTemplate> {
    const existing = await this.storage.getDefaultTemplateForUser(userId);
    if (existing) return existing;
    const template: FooterTemplate = {
      id: uuidv4(),
      userId,
      name: "Default",
      body: config.defaultFooterTemplate,
      isDefault: true,
    };
    await this.storage.upsertTemplate(template);
    return template;
  }

  async render(reminder: Reminder, template: FooterTemplate | null, extraVars: Record<string, string> = {}): Promise<string> {
    const footer = template ? this.interpolate(template.body, { ...extraVars, message: reminder.message }) : "";
    return `${reminder.message}${footer}`;
  }

  private interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? "");
  }
}
