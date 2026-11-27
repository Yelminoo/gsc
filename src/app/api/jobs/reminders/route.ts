import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db";
import { runReminderSweep } from "@/server/services/reminders";
import { getEnv } from "@/lib/env";

/** This reads and writes the database on every call; it must never be cached or prerendered. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The hook for an outside scheduler (Task Scheduler, cron, a hosted cron service):
 *
 *   curl -X POST -H "authorization: Bearer $REMINDER_JOB_SECRET" http://localhost:3001/api/jobs/reminders
 *
 * POST only, so a crawler or a prefetch cannot fire it. With no secret configured the route is
 * closed to everyone rather than open to everyone: a missing setting must fail shut.
 */
export async function POST(request: Request) {
  const { REMINDER_JOB_SECRET } = getEnv();
  if (!REMINDER_JOB_SECRET) {
    return Response.json({ error: "Reminder job is not configured" }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!safeEqual(presented, REMINDER_JOB_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runReminderSweep(getDb(), { userId: null });
  return Response.json(result);
}

/** Constant-time compare that does not leak the secret's length through an early return. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a.padEnd(64).slice(0, 64));
  const right = Buffer.from(b.padEnd(64).slice(0, 64));
  return timingSafeEqual(left, right) && a.length === b.length;
}
