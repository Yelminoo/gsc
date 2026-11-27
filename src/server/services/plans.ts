import { and, asc, eq, ne, sql } from "drizzle-orm";
import { installmentPlans, invoiceItems, invoices, programs, students } from "@/server/db/schema";
import { PAID_ON_INVOICE } from "@/server/db/sql";
import type { DB } from "@/server/db/types";
import { addMonths, today } from "@/lib/dates";
import { splitEvenly, toNumeric, toPya } from "@/lib/money";
import { nextCounter } from "./counters";
import { audit } from "./audit";
import { DomainError } from "./errors";

export type PlanRowInput = { dueDate: string; amountPya: number };

export type CreatePlanInput = {
  studentId: string;
  months: number;
  startDate: string;
  /** Even mode needs the total; manual mode needs a row per month. */
  totalPya?: number;
  rows?: PlanRowInput[];
  note?: string;
  userId: string;
};

const MAX_MONTHS = 60;

/**
 * Build a student's own installment plan and raise its invoices in one transaction.
 *
 * Even mode takes a total and divides it across the months; manual mode takes the amount and due
 * date of every month as the admin typed them. Either way the result is ordinary invoices, so
 * payments, balances, PDFs and reminders all work on them with no special cases.
 */
export async function createPlan(db: DB, input: CreatePlanInput) {
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > MAX_MONTHS) {
    throw new DomainError(`Choose between 1 and ${MAX_MONTHS} months`);
  }
  return db.transaction(async (tx) => {
    const [student] = await tx.select().from(students).where(eq(students.id, input.studentId)).for("update");
    if (!student) throw new DomainError("Student not found");

    // Any live tuition invoice means this student is already being billed, whether it came from
    // an earlier plan or from a shared payment term. Raising a plan on top would double-bill
    // them. Exam fees are excluded: they are charged separately and always sit alongside tuition.
    const open = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(
        eq(invoices.studentId, student.id),
        ne(invoices.status, "void"),
        ne(invoices.kind, "exam"),
      ))
      .limit(1);
    if (open.length > 0) {
      throw new DomainError("This student already has tuition invoices. Void them before building a new plan.");
    }

    const rows = resolveRows(input);
    const total = rows.reduce((sum, r) => sum + r.amountPya, 0);
    if (total <= 0) throw new DomainError("The plan total must be greater than zero");

    const [plan] = await tx.insert(installmentPlans).values({
      studentId: student.id,
      total: toNumeric(total),
      months: input.months,
      mode: input.rows ? "manual" : "even",
      startDate: input.startDate,
      note: input.note,
      createdBy: input.userId,
    }).returning({ id: installmentPlans.id });

    const programName = student.programId
      ? (await tx.select({ name: programs.name }).from(programs).where(eq(programs.id, student.programId)))[0]?.name
      : undefined;

    const issueDate = today();
    const year = issueDate.slice(0, 4);
    const created: { id: string; invoiceNumber: string }[] = [];

    for (const [i, row] of rows.entries()) {
      const seq = await nextCounter(tx, `invoice-${year}`);
      const invoiceNumber = `INV-${year}-${String(seq).padStart(6, "0")}`;
      const [inv] = await tx.insert(invoices).values({
        invoiceNumber,
        studentId: student.id,
        planId: plan.id,
        kind: "tuition",
        installmentNo: i + 1,
        issueDate,
        dueDate: row.dueDate,
        amount: toNumeric(row.amountPya),
      }).returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });

      await tx.insert(invoiceItems).values({
        invoiceId: inv.id,
        description: `${programName ?? "Tuition"} (month ${i + 1} of ${rows.length})`,
        quantity: 1,
        unitPrice: toNumeric(row.amountPya),
      });
      created.push(inv);
    }

    await audit(tx, {
      userId: input.userId, action: "plan.create", entity: "student", entityId: student.id,
      detail: { planId: plan.id, months: input.months, total: toNumeric(total), invoices: created.map((c) => c.invoiceNumber) },
    });
    return { planId: plan.id, invoices: created, total };
  });
}

/** Turn either shape of input into one amount and due date per month. */
function resolveRows(input: CreatePlanInput): PlanRowInput[] {
  if (input.rows) {
    if (input.rows.length !== input.months) throw new DomainError("Fill in an amount for every month");
    for (const r of input.rows) {
      if (!Number.isInteger(r.amountPya) || r.amountPya <= 0) throw new DomainError("Every month must be more than zero");
    }
    return input.rows;
  }
  if (!Number.isInteger(input.totalPya) || (input.totalPya ?? 0) <= 0) {
    throw new DomainError("Enter the total to divide across the months");
  }
  return splitEvenly(input.totalPya!, input.months).map((amountPya, i) => ({
    dueDate: addMonths(input.startDate, i),
    amountPya,
  }));
}

export type PlanSummary = {
  planId: string;
  months: number;
  mode: "even" | "manual";
  startDate: string;
  totalPya: number;
  paidPya: number;
  remainingPya: number;
  nextDue: { invoiceId: string; invoiceNumber: string; dueDate: string; outstandingPya: number } | null;
  overdueCount: number;
};

/** The plan as the student's page shows it: billed, paid, what is left and what falls due next. */
export async function planSummary(db: DB, studentId: string): Promise<PlanSummary | null> {
  const [plan] = await db
    .select()
    .from(installmentPlans)
    .where(eq(installmentPlans.studentId, studentId))
    .orderBy(sql`${installmentPlans.createdAt} desc`)
    .limit(1);
  if (!plan) return null;

  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      dueDate: invoices.dueDate,
      amount: invoices.amount,
      status: invoices.status,
      paid: PAID_ON_INVOICE,
    })
    .from(invoices)
    .where(and(eq(invoices.planId, plan.id), ne(invoices.status, "void")))
    .orderBy(asc(invoices.dueDate));

  const now = today();
  let totalPya = 0, paidPya = 0, overdueCount = 0;
  let nextDue: PlanSummary["nextDue"] = null;

  for (const r of rows) {
    const amount = toPya(r.amount);
    const paid = toPya(r.paid);
    totalPya += amount;
    paidPya += paid;
    const outstanding = amount - paid;
    if (outstanding > 0) {
      if (r.dueDate < now) overdueCount += 1;
      if (!nextDue) nextDue = { invoiceId: r.id, invoiceNumber: r.invoiceNumber, dueDate: r.dueDate, outstandingPya: outstanding };
    }
  }

  return {
    planId: plan.id,
    months: plan.months,
    mode: plan.mode,
    startDate: plan.startDate,
    totalPya,
    paidPya,
    remainingPya: totalPya - paidPya,
    nextDue,
    overdueCount,
  };
}
