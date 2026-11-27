import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  examEntries, examFees, examSessions, invoiceItems, invoices, payments, programs, students,
} from "@/server/db/schema";
import { PAID_ON_INVOICE } from "@/server/db/sql";
import type { DB } from "@/server/db/types";
import { addDays, today } from "@/lib/dates";
import { gbpToPya, toNumeric, toPya } from "@/lib/money";
import { nextCounter } from "./counters";
import { audit } from "./audit";
import { DomainError } from "./errors";

/** An exam invoice falls due before the board's entry deadline, so there is time to chase it. */
const DUE_DAYS_BEFORE_DEADLINE = 14;

/**
 * Enter a student for a sitting and raise the exam fee as its own invoice.
 *
 * The fee is charged on top of tuition, never folded into it, so "has this student cleared the
 * exam fee?" has an answer that does not depend on how their tuition is going. The sterling
 * price is converted at the rate stored on the fee and the kyat figure is frozen onto the
 * invoice: a later rate change cannot restate money already billed.
 */
export async function enterForExam(
  db: DB,
  input: { studentId: string; sessionId: string; isResit?: boolean; userId: string },
) {
  return db.transaction(async (tx) => {
    const [student] = await tx.select().from(students).where(eq(students.id, input.studentId)).for("update");
    if (!student) throw new DomainError("Student not found");
    if (!student.programId) throw new DomainError("Assign a program to this student first");

    const [program] = await tx.select().from(programs).where(eq(programs.id, student.programId));
    if (!program?.hasExam) throw new DomainError("This program does not have an exam");

    const [session] = await tx.select().from(examSessions).where(eq(examSessions.id, input.sessionId));
    if (!session) throw new DomainError("Exam session not found");

    const existing = await tx
      .select({ id: examEntries.id })
      .from(examEntries)
      .where(and(
        eq(examEntries.studentId, student.id),
        eq(examEntries.sessionId, session.id),
        ne(examEntries.status, "withdrawn"),
      ));
    if (existing.length > 0) throw new DomainError("This student is already entered for that sitting");

    const [fee] = await tx
      .select()
      .from(examFees)
      .where(and(eq(examFees.sessionId, session.id), eq(examFees.programId, program.id)));
    if (!fee) throw new DomainError("No exam fee is set for this program in that sitting");

    const isResit = input.isResit ?? false;
    const gbp = isResit ? (fee.resitFeeGbp ?? fee.feeGbp) : fee.feeGbp;
    const amountPya = gbpToPya(gbp, fee.fxRate);
    if (amountPya <= 0) throw new DomainError("The exam fee works out to zero");

    const issueDate = today();
    const year = issueDate.slice(0, 4);
    const seq = await nextCounter(tx, `invoice-${year}`);
    const invoiceNumber = `INV-${year}-${String(seq).padStart(6, "0")}`;
    // Never later than the deadline itself, and never before today on a late entry.
    const dueDate = maxDate(issueDate, addDays(session.entryDeadline, -DUE_DAYS_BEFORE_DEADLINE));

    const [inv] = await tx.insert(invoices).values({
      invoiceNumber,
      studentId: student.id,
      kind: "exam",
      issueDate,
      dueDate,
      amount: toNumeric(amountPya),
    }).returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });

    await tx.insert(invoiceItems).values({
      invoiceId: inv.id,
      description: `${program.name} ${isResit ? "resit " : ""}exam entry, ${session.name} (GBP ${gbp} at ${fee.fxRate} Ks)`,
      quantity: 1,
      unitPrice: toNumeric(amountPya),
    });

    const [entry] = await tx.insert(examEntries).values({
      studentId: student.id,
      sessionId: session.id,
      programId: program.id,
      isResit,
      status: "entered",
      invoiceId: inv.id,
      createdBy: input.userId,
    }).returning({ id: examEntries.id });

    await audit(tx, {
      userId: input.userId, action: "exam.enter", entity: "student", entityId: student.id,
      detail: { entryId: entry.id, sessionId: session.id, invoice: inv.invoiceNumber, amount: toNumeric(amountPya), gbp, fxRate: fee.fxRate },
    });
    return { entryId: entry.id, invoice: inv, amountPya };
  });
}

export async function withdrawFromExam(db: DB, input: { entryId: string; userId: string }) {
  return db.transaction(async (tx) => {
    const [entry] = await tx.select().from(examEntries).where(eq(examEntries.id, input.entryId)).for("update");
    if (!entry) throw new DomainError("Exam entry not found");
    if (entry.status === "withdrawn") throw new DomainError("This entry is already withdrawn");

    if (entry.invoiceId) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(payments)
        .where(eq(payments.invoiceId, entry.invoiceId));
      if (n > 0) throw new DomainError("The exam fee has been paid. Refund it before withdrawing the entry.");
      await tx.update(invoices).set({ status: "void" }).where(eq(invoices.id, entry.invoiceId));
    }
    await tx.update(examEntries).set({ status: "withdrawn" }).where(eq(examEntries.id, entry.id));
    await audit(tx, { userId: input.userId, action: "exam.withdraw", entity: "exam_entry", entityId: entry.id });
  });
}

export type ExamEntryRow = {
  entryId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  studentEmail: string | null;
  sessionId: string;
  sessionName: string;
  examDate: string;
  entryDeadline: string;
  programName: string;
  isResit: boolean;
  status: "draft" | "entered" | "withdrawn";
  invoiceId: string | null;
  invoiceNumber: string | null;
  feePya: number;
  paidPya: number;
  /** True when nothing is left to pay: the student has cleared the exam fee. */
  cleared: boolean;
};

/**
 * Exam entries with the fee settled or not. "Cleared" is computed from the invoice and its
 * payments here rather than stored on the entry, so it can never disagree with the ledger.
 */
export async function listExamEntries(
  db: DB,
  filter: { sessionId?: string; studentId?: string; unpaidOnly?: boolean } = {},
): Promise<ExamEntryRow[]> {
  const where = [ne(examEntries.status, "withdrawn")];
  if (filter.sessionId) where.push(eq(examEntries.sessionId, filter.sessionId));
  if (filter.studentId) where.push(eq(examEntries.studentId, filter.studentId));

  const rows = await db
    .select({
      entryId: examEntries.id,
      studentId: students.id,
      studentCode: students.studentCode,
      studentName: students.fullName,
      studentEmail: students.email,
      sessionId: examSessions.id,
      sessionName: examSessions.name,
      examDate: examSessions.examDate,
      entryDeadline: examSessions.entryDeadline,
      programName: programs.name,
      isResit: examEntries.isResit,
      status: examEntries.status,
      invoiceId: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      amount: invoices.amount,
      invoiceStatus: invoices.status,
      paid: PAID_ON_INVOICE,
    })
    .from(examEntries)
    .innerJoin(students, eq(examEntries.studentId, students.id))
    .innerJoin(examSessions, eq(examEntries.sessionId, examSessions.id))
    .innerJoin(programs, eq(examEntries.programId, programs.id))
    .leftJoin(invoices, eq(examEntries.invoiceId, invoices.id))
    .where(and(...where))
    .orderBy(asc(examSessions.examDate), asc(students.fullName));

  const out = rows.map((r) => {
    const feePya = r.amount ? toPya(r.amount) : 0;
    const paidPya = r.paid ? toPya(r.paid) : 0;
    return {
      entryId: r.entryId,
      studentId: r.studentId,
      studentCode: r.studentCode,
      studentName: r.studentName,
      studentEmail: r.studentEmail,
      sessionId: r.sessionId,
      sessionName: r.sessionName,
      examDate: r.examDate,
      entryDeadline: r.entryDeadline,
      programName: r.programName,
      isResit: r.isResit,
      status: r.status,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoiceNumber,
      feePya,
      paidPya,
      cleared: r.invoiceStatus === "void" ? false : feePya > 0 && paidPya >= feePya,
    };
  });
  return filter.unpaidOnly ? out.filter((r) => !r.cleared) : out;
}

const maxDate = (a: string, b: string) => (a > b ? a : b);
