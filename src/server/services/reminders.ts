import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import {
  examEntries, examSessions, invoices, notifications, programs, students,
} from "@/server/db/schema";
import { PAID_ON_INVOICE } from "@/server/db/sql";
import type { DB } from "@/server/db/types";
import { addDays, daysBetween, today } from "@/lib/dates";
import { formatMMK, toPya } from "@/lib/money";
import { flushOutbox, queueEmail } from "./email";
import { getSettings, intSetting } from "./settings";
import { audit } from "./audit";

type Kind = "invoice_due_soon" | "invoice_overdue" | "exam_fee_unpaid" | "exam_entry_deadline";

type Chase = {
  kind: Kind;
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  invoiceId?: string;
  examEntryId?: string;
  title: string;
  body: string;
  /** Identifies the thing being chased, so the same chase repeats only after the interval. */
  subject: string;
};

export type SweepResult = {
  scanned: { overdue: number; dueSoon: number; examUnpaid: number; missingEntry: number };
  notificationsCreated: number;
  emailsQueued: number;
  delivery: Awaited<ReturnType<typeof flushOutbox>> | null;
};

/**
 * The daily sweep: find what needs chasing, record it in the notification centre, and queue the
 * mail. It is safe to run as often as you like. Every chase carries a dedupe key built from the
 * thing chased and the current reminder window, so running twice in a morning writes nothing the
 * second time, and a student is chased again only once the interval has passed.
 */
export async function runReminderSweep(
  db: DB,
  opts: { userId?: string | null; send?: boolean; now?: string } = {},
): Promise<SweepResult> {
  const now = opts.now ?? today();
  const config = await getSettings(db);
  const intervalDays = intSetting(config, "reminder_interval_days");
  const dueSoonDays = intSetting(config, "due_soon_days");
  const officeEmail = config.office_email.trim();

  const chases: Chase[] = [];
  const scanned = { overdue: 0, dueSoon: 0, examUnpaid: 0, missingEntry: 0 };

  // 1. Invoices with money still on them.
  const open = await db
    .select({
      id: invoices.id,
      number: invoices.invoiceNumber,
      kind: invoices.kind,
      dueDate: invoices.dueDate,
      amount: invoices.amount,
      studentId: students.id,
      studentName: students.fullName,
      studentEmail: students.email,
      paid: PAID_ON_INVOICE,
    })
    .from(invoices)
    .innerJoin(students, eq(invoices.studentId, students.id))
    .where(and(ne(invoices.status, "void"), ne(invoices.status, "paid")))
    .orderBy(asc(invoices.dueDate));

  const soonest = addDays(now, dueSoonDays);
  for (const inv of open) {
    const outstanding = toPya(inv.amount) - toPya(inv.paid);
    if (outstanding <= 0) continue;
    const amount = formatMMK(outstanding);
    const what = inv.kind === "exam" ? "exam fee" : "tuition";

    if (inv.dueDate < now) {
      scanned.overdue += 1;
      const late = daysBetween(inv.dueDate, now);
      chases.push({
        kind: "invoice_overdue",
        studentId: inv.studentId, studentName: inv.studentName, studentEmail: inv.studentEmail,
        invoiceId: inv.id,
        subject: `invoice:${inv.id}`,
        title: `${inv.studentName}: ${amount} overdue`,
        body: `Invoice ${inv.number} (${what}) was due on ${inv.dueDate}, ${late} day${late === 1 ? "" : "s"} ago. ${amount} is outstanding.`,
      });
    } else if (inv.dueDate <= soonest) {
      scanned.dueSoon += 1;
      chases.push({
        kind: "invoice_due_soon",
        studentId: inv.studentId, studentName: inv.studentName, studentEmail: inv.studentEmail,
        invoiceId: inv.id,
        subject: `invoice:${inv.id}`,
        title: `${inv.studentName}: ${amount} due ${inv.dueDate}`,
        body: `Invoice ${inv.number} (${what}) falls due on ${inv.dueDate}. ${amount} is outstanding.`,
      });
    }
  }

  // 2. Exam entries where the fee has not been cleared, while the sitting still matters.
  const entries = await db
    .select({
      entryId: examEntries.id,
      studentId: students.id,
      studentName: students.fullName,
      studentEmail: students.email,
      sessionName: examSessions.name,
      examDate: examSessions.examDate,
      entryDeadline: examSessions.entryDeadline,
      invoiceId: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      amount: invoices.amount,
      paid: PAID_ON_INVOICE,
    })
    .from(examEntries)
    .innerJoin(students, eq(examEntries.studentId, students.id))
    .innerJoin(examSessions, eq(examEntries.sessionId, examSessions.id))
    .leftJoin(invoices, eq(examEntries.invoiceId, invoices.id))
    .where(and(ne(examEntries.status, "withdrawn"), sql`${examSessions.examDate} >= ${now}`));

  for (const e of entries) {
    const fee = e.amount ? toPya(e.amount) : 0;
    const paid = e.paid ? toPya(e.paid) : 0;
    if (fee > 0 && paid >= fee) continue;
    scanned.examUnpaid += 1;
    const left = formatMMK(Math.max(fee - paid, 0));
    chases.push({
      kind: "exam_fee_unpaid",
      studentId: e.studentId, studentName: e.studentName, studentEmail: e.studentEmail,
      invoiceId: e.invoiceId ?? undefined,
      examEntryId: e.entryId,
      subject: `exam-entry:${e.entryId}`,
      title: `${e.studentName}: exam fee not cleared for ${e.sessionName}`,
      body: `${left} of the exam fee for ${e.sessionName} is still outstanding${e.invoiceNumber ? ` on invoice ${e.invoiceNumber}` : ""}. Entries close on ${e.entryDeadline} and the exam is on ${e.examDate}.`,
    });
  }

  // 3. Students on an exam program with no entry, while entries are still open.
  const deadlineHorizon = addDays(now, 30);
  const missing = await db
    .select({
      studentId: students.id,
      studentName: students.fullName,
      studentEmail: students.email,
      sessionId: examSessions.id,
      sessionName: examSessions.name,
      entryDeadline: examSessions.entryDeadline,
    })
    .from(students)
    .innerJoin(programs, eq(students.programId, programs.id))
    .innerJoin(examSessions, sql`true`)
    .leftJoin(examEntries, and(
      eq(examEntries.studentId, students.id),
      eq(examEntries.sessionId, examSessions.id),
      ne(examEntries.status, "withdrawn"),
    ))
    .where(and(
      eq(programs.hasExam, true),
      eq(students.status, "active"),
      isNull(examEntries.id),
      sql`${examSessions.entryDeadline} between ${now} and ${deadlineHorizon}`,
    ));

  for (const m of missing) {
    scanned.missingEntry += 1;
    const left = daysBetween(now, m.entryDeadline);
    chases.push({
      kind: "exam_entry_deadline",
      studentId: m.studentId, studentName: m.studentName, studentEmail: m.studentEmail,
      subject: `exam-session:${m.sessionId}:student:${m.studentId}`,
      title: `${m.studentName} is not entered for ${m.sessionName}`,
      body: `Entries for ${m.sessionName} close on ${m.entryDeadline}, in ${left} day${left === 1 ? "" : "s"}. This student is on an exam program but has no entry.`,
    });
  }

  // Record and mail, skipping anything already chased inside the interval.
  let notificationsCreated = 0;
  let emailsQueued = 0;
  const digest: string[] = [];

  for (const chase of chases) {
    const window = await currentWindow(db, chase, now, intervalDays);
    if (window === null) continue;
    const dedupeKey = `${chase.kind}:${chase.subject}:${window}`;

    const [created] = await db.insert(notifications).values({
      kind: chase.kind,
      studentId: chase.studentId,
      invoiceId: chase.invoiceId,
      examEntryId: chase.examEntryId,
      title: chase.title,
      body: chase.body,
      dedupeKey,
    }).onConflictDoNothing({ target: notifications.dedupeKey }).returning({ id: notifications.id });
    if (!created) continue;
    notificationsCreated += 1;
    digest.push(`- ${chase.title}\n  ${chase.body}`);

    // The entry-deadline nudge is for staff to act on, not something to mail a student about.
    if (chase.studentEmail && chase.kind !== "exam_entry_deadline") {
      const queued = await queueEmail(db, {
        toEmail: chase.studentEmail,
        toName: chase.studentName,
        subject: subjectLine(chase.kind),
        bodyText: studentBody(chase),
        dedupeKey: `student:${dedupeKey}`,
        notificationId: created.id,
      });
      if (queued) emailsQueued += 1;
    }
  }

  if (officeEmail && digest.length > 0) {
    const queued = await queueEmail(db, {
      toEmail: officeEmail,
      toName: "School office",
      subject: `Fees needing attention, ${now} (${digest.length})`,
      bodyText: `${digest.length} item${digest.length === 1 ? "" : "s"} need attention today.\n\n${digest.join("\n\n")}\n`,
      dedupeKey: `office:${now}:${digest.length}`,
    });
    if (queued) emailsQueued += 1;
  }

  const delivery = opts.send === false ? null : await flushOutbox(db);
  await audit(db, {
    userId: opts.userId ?? null,
    action: "reminders.sweep",
    entity: "system",
    detail: { scanned, notificationsCreated, emailsQueued, delivery },
  });
  return { scanned, notificationsCreated, emailsQueued, delivery };
}

/**
 * The reminder window this chase falls in, or null if it was chased too recently. Windows are
 * counted from the last reminder rather than the calendar, so changing the interval takes effect
 * at once instead of waiting for a boundary.
 */
async function currentWindow(db: DB, chase: Chase, now: string, intervalDays: number): Promise<string | null> {
  const [last] = await db
    .select({ createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.kind, chase.kind), sql`${notifications.dedupeKey} like ${`${chase.kind}:${chase.subject}:%`}`))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  if (!last) return now;
  const lastDay = new Date(last.createdAt).toISOString().slice(0, 10);
  return daysBetween(lastDay, now) >= intervalDays ? now : null;
}

function subjectLine(kind: Kind): string {
  switch (kind) {
    case "invoice_overdue": return "Overdue payment at GSC Gemmological School";
    case "exam_fee_unpaid": return "Your exam fee is not yet cleared";
    default: return "A payment is coming due at GSC Gemmological School";
  }
}

function studentBody(chase: Chase): string {
  return [
    `Dear ${chase.studentName},`,
    "",
    chase.body,
    "",
    "If you have already paid, please ignore this message, or send us the transfer slip so we can mark it off.",
    "",
    "GSC Gemmological School",
    "Yangon",
  ].join("\n");
}
