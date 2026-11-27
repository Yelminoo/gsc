import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { examSessions, examFees, invoices, notifications, emailOutbox, programs, settings, students } from "@/server/db/schema";
import { createPlan, planSummary } from "@/server/services/plans";
import { enterForExam, listExamEntries, withdrawFromExam } from "@/server/services/exams";
import { generateInvoices, recordPayment } from "@/server/services/invoicing";
import { runReminderSweep } from "@/server/services/reminders";
import { registerStudent } from "@/server/services/students";
import { DomainError } from "@/server/services/errors";
import { addMonths } from "@/lib/dates";
import { gbpToPya, splitEvenly, toPya } from "@/lib/money";
import type { DB } from "@/server/db/types";
import { seed, testDb } from "./helpers";

let db: DB;
let ctx: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  db = await testDb();
  ctx = await seed(db);
});

describe("splitting a total evenly", () => {
  it("adds up to the total exactly, with the odd pya first", () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(1000, 3).reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("handles a total smaller than the number of months", () => {
    expect(splitEvenly(2, 5)).toEqual([1, 1, 0, 0, 0]);
  });

  it("rejects a nonsense number of parts", () => {
    expect(() => splitEvenly(100, 0)).toThrow();
  });
});

describe("adding months to a date", () => {
  it("clamps to the end of a short month rather than overflowing", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
  });

  it("crosses a year boundary", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("sterling conversion", () => {
  it("converts at the stored rate", () => {
    expect(gbpToPya("285", "2850")).toBe(285 * 2850 * 100);
  });
});

describe("installment plans", () => {
  it("divides a total evenly and raises one invoice a month", async () => {
    const student = await registerStudent(db, { fullName: "Plan Even", programId: ctx.program.id }, ctx.user.id);
    const res = await createPlan(db, {
      studentId: student.id, months: 6, startDate: "2027-01-10", totalPya: toPya("4800000"), userId: ctx.user.id,
    });
    expect(res.invoices).toHaveLength(6);

    const rows = await db.select().from(invoices).where(eq(invoices.studentId, student.id));
    expect(rows.every((r) => r.kind === "tuition")).toBe(true);
    expect(rows.map((r) => toPya(r.amount)).reduce((a, b) => a + b, 0)).toBe(toPya("4800000"));
    expect(rows.map((r) => r.dueDate).sort()).toEqual([
      "2027-01-10", "2027-02-10", "2027-03-10", "2027-04-10", "2027-05-10", "2027-06-10",
    ]);
  });

  it("bills exactly what the admin typed in manual mode", async () => {
    const student = await registerStudent(db, { fullName: "Plan Manual", programId: ctx.program.id }, ctx.user.id);
    await createPlan(db, {
      studentId: student.id, months: 3, startDate: "2027-01-01", userId: ctx.user.id,
      rows: [
        { dueDate: "2027-01-05", amountPya: toPya("2000000") },
        { dueDate: "2027-03-05", amountPya: toPya("1000000") },
        { dueDate: "2027-06-05", amountPya: toPya("500000") },
      ],
    });
    const summary = await planSummary(db, student.id);
    expect(summary?.mode).toBe("manual");
    expect(summary?.totalPya).toBe(toPya("3500000"));
    expect(summary?.nextDue?.dueDate).toBe("2027-01-05");
  });

  it("tracks what is left after a payment", async () => {
    const student = await registerStudent(db, { fullName: "Plan Paying", programId: ctx.program.id }, ctx.user.id);
    const res = await createPlan(db, {
      studentId: student.id, months: 2, startDate: "2027-02-01", totalPya: toPya("1000000"), userId: ctx.user.id,
    });
    await recordPayment(db, {
      invoiceId: res.invoices[0].id, amountPya: toPya("500000"), method: "cash", paidDate: "2026-01-01", userId: ctx.user.id,
    });
    const summary = await planSummary(db, student.id);
    expect(summary?.paidPya).toBe(toPya("500000"));
    expect(summary?.remainingPya).toBe(toPya("500000"));
  });

  it("refuses a second plan while the first still has live invoices", async () => {
    const student = await registerStudent(db, { fullName: "Plan Twice", programId: ctx.program.id }, ctx.user.id);
    await createPlan(db, { studentId: student.id, months: 2, startDate: "2027-01-01", totalPya: 100_000, userId: ctx.user.id });
    await expect(createPlan(db, { studentId: student.id, months: 2, startDate: "2027-01-01", totalPya: 100_000, userId: ctx.user.id }))
      .rejects.toBeInstanceOf(DomainError);
  });

  it("refuses a plan for a student already billed on a shared payment term", async () => {
    const student = await registerStudent(db, { fullName: "Plan On Term", programId: ctx.program.id }, ctx.user.id);
    await generateInvoices(db, { studentId: student.id, termId: ctx.term.id, userId: ctx.user.id });
    await expect(createPlan(db, { studentId: student.id, months: 3, startDate: "2027-01-01", totalPya: 100_000, userId: ctx.user.id }))
      .rejects.toBeInstanceOf(DomainError);
  });

  it("still allows a plan for a student who only owes an exam fee", async () => {
    const [p] = await db.insert(programs).values({ name: "Exam Only Program", tuitionFee: "100.00", hasExam: true }).returning();
    const [s] = await db.insert(examSessions).values({ name: "Exam Only Sitting", examDate: "2099-05-01", entryDeadline: "2099-03-01" }).returning();
    await db.insert(examFees).values({ sessionId: s.id, programId: p.id, feeGbp: "285.00", fxRate: "2850.0000" });
    const student = await registerStudent(db, { fullName: "Exam Fee Only", programId: p.id }, ctx.user.id);
    await enterForExam(db, { studentId: student.id, sessionId: s.id, userId: ctx.user.id });

    const res = await createPlan(db, { studentId: student.id, months: 2, startDate: "2027-01-01", totalPya: 100_000, userId: ctx.user.id });
    expect(res.invoices).toHaveLength(2);
  });

  it("rejects a month count outside the allowed range", async () => {
    const student = await registerStudent(db, { fullName: "Plan Long", programId: ctx.program.id }, ctx.user.id);
    await expect(createPlan(db, { studentId: student.id, months: 99, startDate: "2027-01-01", totalPya: 100_000, userId: ctx.user.id }))
      .rejects.toBeInstanceOf(DomainError);
  });
});

describe("exam fees", () => {
  let sessionId: string;
  let examProgramId: string;

  beforeAll(async () => {
    const [p] = await db.insert(programs).values({
      name: "Gem-A Diploma", tuitionFee: "4800000.00", hasExam: true, examBoard: "Gem-A",
    }).returning();
    examProgramId = p.id;
    const [s] = await db.insert(examSessions).values({
      name: "Gem-A January 2028", examDate: "2028-01-20", entryDeadline: "2027-11-01",
    }).returning();
    sessionId = s.id;
    await db.insert(examFees).values({
      sessionId, programId: examProgramId, feeGbp: "285.00", resitFeeGbp: "150.00", fxRate: "2850.0000",
    });
  });

  it("raises the exam fee as its own invoice, not folded into tuition", async () => {
    const student = await registerStudent(db, { fullName: "Exam Sitter", programId: examProgramId }, ctx.user.id);
    const res = await enterForExam(db, { studentId: student.id, sessionId, userId: ctx.user.id });
    expect(res.amountPya).toBe(gbpToPya("285.00", "2850.0000"));

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, res.invoice.id));
    expect(inv.kind).toBe("exam");
    expect(inv.planId).toBeNull();
  });

  it("charges the resit fee for a resit", async () => {
    const student = await registerStudent(db, { fullName: "Exam Resitter", programId: examProgramId }, ctx.user.id);
    const res = await enterForExam(db, { studentId: student.id, sessionId, isResit: true, userId: ctx.user.id });
    expect(res.amountPya).toBe(gbpToPya("150.00", "2850.0000"));
  });

  it("reports the fee as cleared only once it is fully paid", async () => {
    const student = await registerStudent(db, { fullName: "Exam Payer", programId: examProgramId }, ctx.user.id);
    const res = await enterForExam(db, { studentId: student.id, sessionId, userId: ctx.user.id });

    let [entry] = await listExamEntries(db, { studentId: student.id });
    expect(entry.cleared).toBe(false);

    await recordPayment(db, {
      invoiceId: res.invoice.id, amountPya: Math.floor(res.amountPya / 2), method: "cash", paidDate: "2026-01-01", userId: ctx.user.id,
    });
    [entry] = await listExamEntries(db, { studentId: student.id });
    expect(entry.cleared).toBe(false);

    await recordPayment(db, {
      invoiceId: res.invoice.id, amountPya: res.amountPya - Math.floor(res.amountPya / 2), method: "cash", paidDate: "2026-01-01", userId: ctx.user.id,
    });
    [entry] = await listExamEntries(db, { studentId: student.id });
    expect(entry.cleared).toBe(true);
  });

  it("refuses a second entry for the same sitting", async () => {
    const student = await registerStudent(db, { fullName: "Exam Double", programId: examProgramId }, ctx.user.id);
    await enterForExam(db, { studentId: student.id, sessionId, userId: ctx.user.id });
    await expect(enterForExam(db, { studentId: student.id, sessionId, userId: ctx.user.id }))
      .rejects.toBeInstanceOf(DomainError);
  });

  it("refuses an entry for a program with no exam", async () => {
    const student = await registerStudent(db, { fullName: "No Exam", programId: ctx.program.id }, ctx.user.id);
    await expect(enterForExam(db, { studentId: student.id, sessionId, userId: ctx.user.id }))
      .rejects.toBeInstanceOf(DomainError);
  });

  it("voids the invoice on withdrawal, but not once the fee is paid", async () => {
    const a = await registerStudent(db, { fullName: "Exam Withdraw", programId: examProgramId }, ctx.user.id);
    const ra = await enterForExam(db, { studentId: a.id, sessionId, userId: ctx.user.id });
    await withdrawFromExam(db, { entryId: ra.entryId, userId: ctx.user.id });
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, ra.invoice.id));
    expect(inv.status).toBe("void");

    const b = await registerStudent(db, { fullName: "Exam Paid Withdraw", programId: examProgramId }, ctx.user.id);
    const rb = await enterForExam(db, { studentId: b.id, sessionId, userId: ctx.user.id });
    await recordPayment(db, { invoiceId: rb.invoice.id, amountPya: rb.amountPya, method: "cash", paidDate: "2026-01-01", userId: ctx.user.id });
    await expect(withdrawFromExam(db, { entryId: rb.entryId, userId: ctx.user.id })).rejects.toBeInstanceOf(DomainError);
  });
});

describe("the reminder sweep", () => {
  it("chases an overdue invoice once, mails the student and copies the office", async () => {
    const fresh = await testDb();
    const f = await seed(fresh);
    await fresh.insert(settings).values({ key: "office_email", value: "office@gsc.test" });

    const student = await registerStudent(fresh, { fullName: "Late Payer", email: "late@gsc.test", programId: f.program.id }, f.user.id);
    await createPlan(fresh, {
      studentId: student.id, months: 2, startDate: "2020-01-01", totalPya: toPya("500000"), userId: f.user.id,
    });

    const first = await runReminderSweep(fresh, { userId: f.user.id });
    expect(first.scanned.overdue).toBe(2);
    expect(first.notificationsCreated).toBe(2);

    const mails = await fresh.select().from(emailOutbox);
    expect(mails.filter((m) => m.toEmail === "late@gsc.test")).toHaveLength(2);
    expect(mails.filter((m) => m.toEmail === "office@gsc.test")).toHaveLength(1);

    // Running again the same day must not chase the same invoices a second time.
    const second = await runReminderSweep(fresh, { userId: f.user.id });
    expect(second.notificationsCreated).toBe(0);
    expect(await fresh.select().from(notifications)).toHaveLength(2);
  });

  it("chases an unpaid exam fee and stops once it is settled", async () => {
    const fresh = await testDb();
    const f = await seed(fresh);
    const [p] = await fresh.insert(programs).values({
      name: "Diploma", tuitionFee: "4800000.00", hasExam: true, examBoard: "Gem-A",
    }).returning();
    const [s] = await fresh.insert(examSessions).values({
      name: "Sitting", examDate: "2099-01-20", entryDeadline: "2098-11-01",
    }).returning();
    await fresh.insert(examFees).values({ sessionId: s.id, programId: p.id, feeGbp: "285.00", fxRate: "2850.0000" });

    const student = await registerStudent(fresh, { fullName: "Exam Debtor", email: "debtor@gsc.test", programId: p.id }, f.user.id);
    const entry = await enterForExam(fresh, { studentId: student.id, sessionId: s.id, userId: f.user.id });

    const first = await runReminderSweep(fresh, { userId: f.user.id });
    expect(first.scanned.examUnpaid).toBe(1);

    await recordPayment(fresh, {
      invoiceId: entry.invoice.id, amountPya: entry.amountPya, method: "bank_transfer", paidDate: "2026-01-01", userId: f.user.id,
    });
    const after = await runReminderSweep(fresh, { userId: f.user.id, now: "2030-06-01" });
    expect(after.scanned.examUnpaid).toBe(0);
  });

  it("flags a student on an exam program who has not been entered", async () => {
    const fresh = await testDb();
    const f = await seed(fresh);
    const [p] = await fresh.insert(programs).values({ name: "Diploma", tuitionFee: "100.00", hasExam: true }).returning();
    const [s] = await fresh.insert(examSessions).values({
      name: "Closing soon", examDate: "2026-03-01", entryDeadline: "2026-01-20",
    }).returning();
    await fresh.insert(examFees).values({ sessionId: s.id, programId: p.id, feeGbp: "285.00", fxRate: "2850.0000" });
    await registerStudent(fresh, { fullName: "Not Entered", email: "ne@gsc.test", programId: p.id }, f.user.id);

    const r = await runReminderSweep(fresh, { userId: f.user.id, now: "2026-01-05" });
    expect(r.scanned.missingEntry).toBe(1);
    const rows = await fresh.select().from(notifications).where(eq(notifications.kind, "exam_entry_deadline"));
    expect(rows).toHaveLength(1);
    // Staff act on this one; it is not something to mail the student about.
    const mails = await fresh.select().from(emailOutbox).where(eq(emailOutbox.toEmail, "ne@gsc.test"));
    expect(mails).toHaveLength(0);
  });

  // Regression: the paid-to-date subquery once compared a payment to itself and reported every
  // invoice as unpaid, which would have chased students who had settled in full.
  it("does not chase an overdue invoice that has been paid off", async () => {
    const fresh = await testDb();
    const f = await seed(fresh);
    const student = await registerStudent(fresh, { fullName: "Settled", email: "settled@gsc.test", programId: f.program.id }, f.user.id);
    const plan = await createPlan(fresh, {
      studentId: student.id, months: 1, startDate: "2020-01-01", totalPya: toPya("300000"), userId: f.user.id,
    });
    await recordPayment(fresh, {
      invoiceId: plan.invoices[0].id, amountPya: toPya("300000"), method: "cash", paidDate: "2020-02-01", userId: f.user.id,
    });

    const r = await runReminderSweep(fresh, { userId: f.user.id });
    expect(r.scanned.overdue).toBe(0);
    expect(r.notificationsCreated).toBe(0);
    expect(await fresh.select().from(emailOutbox)).toHaveLength(0);
  });

  it("leaves a student with no email address out of the mail, but still records the chase", async () => {
    const fresh = await testDb();
    const f = await seed(fresh);
    const student = await registerStudent(fresh, { fullName: "No Email", programId: f.program.id }, f.user.id);
    await createPlan(fresh, { studentId: student.id, months: 1, startDate: "2020-01-01", totalPya: 100_000, userId: f.user.id });

    const r = await runReminderSweep(fresh, { userId: f.user.id });
    expect(r.notificationsCreated).toBe(1);
    expect(await fresh.select().from(emailOutbox)).toHaveLength(0);

    const [s] = await fresh.select().from(students).where(and(eq(students.id, student.id)));
    expect(s.email).toBeNull();
  });
});
