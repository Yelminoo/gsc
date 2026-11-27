/**
 * Optional in-process scheduler for the daily reminder sweep.
 *
 * The school runs this app on one machine with no cron, so the sweep can run from inside the
 * server. It is off unless REMINDER_JOB_IN_PROCESS=1, because anywhere with more than one
 * instance should drive it from the job route instead and not have every replica sweeping.
 *
 * Only the first pass is scheduled here; the sweep is idempotent, so a restart at a bad moment
 * costs nothing worse than an early run that writes nothing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.REMINDER_JOB_IN_PROCESS !== "1") return;

  const HOUR = 9; // Yangon time, when the office is open and someone can act on it.
  const { runReminderSweep } = await import("@/server/services/reminders");
  const { getDb } = await import("@/server/db");

  const tick = async () => {
    try {
      const r = await runReminderSweep(getDb(), { userId: null });
      console.info(`[reminders] ${r.notificationsCreated} recorded, ${r.emailsQueued} queued, ${r.delivery?.sent ?? 0} sent`);
    } catch (e) {
      console.error("[reminders] sweep failed", e instanceof Error ? e.message : e);
    }
    setTimeout(() => void tick(), 24 * 60 * 60 * 1000).unref();
  };

  const now = new Date();
  // 09:00 in Yangon (UTC+6:30) is 02:30 UTC.
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), HOUR - 7, 30, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  setTimeout(() => void tick(), next.getTime() - now.getTime()).unref();
  console.info(`[reminders] daily sweep scheduled for ${next.toISOString()}`);
}
