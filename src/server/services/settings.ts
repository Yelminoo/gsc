import { inArray, sql } from "drizzle-orm";
import { settings } from "@/server/db/schema";
import type { DB } from "@/server/db/types";

/** Operational values the office can change in the app, rather than in a file on the server. */
export const SETTING_KEYS = {
  officeEmail: "office_email",
  /** Days of silence before the same chase goes out again. */
  reminderIntervalDays: "reminder_interval_days",
  /** How far ahead a due date is worth a heads-up. */
  dueSoonDays: "due_soon_days",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

const DEFAULTS: Record<SettingKey, string> = {
  office_email: "",
  reminder_interval_days: "7",
  due_soon_days: "7",
};

export async function getSettings(db: DB): Promise<Record<SettingKey, string>> {
  const rows = await db.select().from(settings).where(inArray(settings.key, Object.values(SETTING_KEYS)));
  const out = { ...DEFAULTS };
  for (const r of rows) if (r.key in out) out[r.key as SettingKey] = r.value;
  return out;
}

export async function setSetting(db: DB, key: SettingKey, value: string) {
  await db.insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`now()` } });
}

/** A positive integer setting, falling back to its default when someone has typed nonsense. */
export function intSetting(all: Record<SettingKey, string>, key: SettingKey): number {
  const n = Number(all[key]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : Number(DEFAULTS[key]);
}
