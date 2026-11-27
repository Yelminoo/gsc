"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { requireUser } from "@/server/auth/dal";
import { runReminderSweep } from "@/server/services/reminders";
import { setSetting } from "@/server/services/settings";
import { idSchema, settingsSchema } from "@/lib/validators";
import { parseForm, toState } from "./helpers";
import type { ActionState } from "./types";

/** The Send now button: the same sweep the daily job runs, triggered by a person. */
export async function sendRemindersAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "accountant"]);
  try {
    const r = await runReminderSweep(getDb(), { userId: user.id });
    revalidatePath("/reminders");
    revalidatePath("/students", "layout");
    const sent = r.delivery?.sent ?? 0;
    if (r.notificationsCreated === 0) return { success: "Nothing new to chase. Everything is either paid or was reminded recently." };
    return { success: `${r.notificationsCreated} reminder${r.notificationsCreated === 1 ? "" : "s"} recorded, ${r.emailsQueued} email${r.emailsQueued === 1 ? "" : "s"} queued, ${sent} sent.` };
  } catch (e) {
    return toState(e);
  }
}

export async function markNotificationReadAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["admin", "accountant"]);
  const id = idSchema.safeParse(formData.get("notificationId"));
  if (!id.success) return { error: "Unknown notification." };
  try {
    await getDb().update(notifications).set({ readAt: sql`now()` })
      .where(and(eq(notifications.id, id.data), isNull(notifications.readAt)));
    revalidatePath("/reminders");
    revalidatePath("/students", "layout");
    return {};
  } catch (e) {
    return toState(e);
  }
}

export async function markAllReadAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  await requireUser(["admin", "accountant"]);
  try {
    await getDb().update(notifications).set({ readAt: sql`now()` }).where(isNull(notifications.readAt));
    revalidatePath("/reminders");
    revalidatePath("/students", "layout");
    return { success: "All marked as read." };
  } catch (e) {
    return toState(e);
  }
}

export async function saveReminderSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["admin"]);
  const parsed = parseForm(settingsSchema, formData);
  if (!parsed.ok) return parsed.state;
  try {
    const db = getDb();
    await setSetting(db, "office_email", parsed.data.officeEmail ?? "");
    await setSetting(db, "reminder_interval_days", String(parsed.data.reminderIntervalDays));
    await setSetting(db, "due_soon_days", String(parsed.data.dueSoonDays));
    revalidatePath("/reminders");
    return { success: "Settings saved." };
  } catch (e) {
    return toState(e);
  }
}
