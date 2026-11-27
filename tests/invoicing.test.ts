import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { invoices, payments, students } from "@/server/db/schema";
import { generateInvoices, recordPayment, voidInvoice } from "@/server/services/invoicing";
import { createPaymentTerm } from "@/server/services/terms";
import { DomainError } from "@/server/services/errors";
import { getInvoice, listStudents, reportSummary } from "@/server/queries";
import { toPya } from "@/lib/money";
import type { DB } from "@/server/db/types";
import { seed, testDb } from "./helpers";

let db: DB;
let ctx: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  db = await testDb();
  ctx = await seed(db);
});

describe("student registration", () => {
  it("auto-generates a unique student code", () => {
    expect(ctx.student.studentCode).toMatch(/^GJS-\d{4}-0001$/);
  });
});

describe("term validation", () => {
  it("rejects installments that do not total 100%", async () => {
    await expect(createPaymentTerm(db, { name: "bad", discountPercent: 0, userId: ctx.user.id, installments: [{ percentage: 50, dueOffsetDays: 0 }] }))
      .rejects.toBeInstanceOf(DomainError);
  });
});

describe("invoicing and payments", () => {
  let invs: { id: string; invoiceNumber: string }[];

  it("splits tuition across installments with exact totals", async () => {
    invs = await generateInvoices(db, { studentId: ctx.student.id, termId: ctx.term.id, userId: ctx.user.id });
    expect(invs).toHaveLength(3);
    const rows = await db.select().from(invoices).where(eq(invoices.studentId, ctx.student.id));
    expect(rows.reduce((a, r) => a + toPya(r.amount), 0)).toBe(1_500_000);
    expect(new Set(rows.map((r) => r.invoiceNumber)).size).toBe(3);
  });

  it("refuses to generate the same term twice", async () => {
    await expect(generateInvoices(db, { studentId: ctx.student.id, termId: ctx.term.id, userId: ctx.user.id }))
      .rejects.toThrow(/already exist/);
  });

  it("supports partial then full payment and blocks overpayment", async () => {
    const id = invs[0].id;
    const inv = await getInvoice(db, id);
    const total = toPya(inv!.invoice.amount);

    await expect(recordPayment(db, { invoiceId: id, amountPya: total + 1, method: "cash", userId: ctx.user.id })).rejects.toThrow(/larger than/);
    await expect(recordPayment(db, { invoiceId: id, amountPya: 0, method: "cash", userId: ctx.user.id })).rejects.toBeInstanceOf(DomainError);
    await expect(recordPayment(db, { invoiceId: id, amountPya: 100, method: "cash", paidDate: "2999-01-01", userId: ctx.user.id })).rejects.toThrow(/future/);

    expect((await recordPayment(db, { invoiceId: id, amountPya: 100_000, method: "cash", userId: ctx.user.id })).status).toBe("partial");
    expect((await recordPayment(db, { invoiceId: id, amountPya: total - 100_000, method: "bank_transfer", userId: ctx.user.id })).status).toBe("paid");
    await expect(recordPayment(db, { invoiceId: id, amountPya: 1, method: "cash", userId: ctx.user.id })).rejects.toThrow(/fully paid/);
  });

  it("cannot void an invoice that has payments, but can void an unpaid one", async () => {
    await expect(voidInvoice(db, { invoiceId: invs[0].id, userId: ctx.user.id })).rejects.toThrow(/payments/);
    await voidInvoice(db, { invoiceId: invs[2].id, userId: ctx.user.id });
    await expect(recordPayment(db, { invoiceId: invs[2].id, amountPya: 100, method: "cash", userId: ctx.user.id })).rejects.toThrow(/void/);
  });

  it("database rejects non-positive payments even if the app is bypassed", async () => {
    await expect(db.insert(payments).values({ invoiceId: invs[1].id, amount: "0.00", paidDate: "2026-01-01", method: "cash" })).rejects.toThrow();
  });

  it("reports totals that exclude void invoices", async () => {
    const r = await reportSummary(db);
    // 15,000 split 33.33/33.33/33.34 = 4,999.50 + 4,999.50 + 5,001.00; the 5,001.00 invoice was voided.
    expect(toPya(r.totals.invoiced)).toBe(999_900);
    expect(toPya(r.totals.collected)).toBe(toPya((await getInvoice(db, invs[0].id))!.invoice.paid));
    expect(toPya(r.totals.outstanding)).toBe(toPya(r.totals.invoiced) - toPya(r.totals.collected));
  });
});

describe("queries are injection safe", () => {
  it("treats % and quotes in search as literal text", async () => {
    await db.update(students).set({ fullName: "Mya Mya" }).where(eq(students.id, ctx.student.id));
    expect((await listStudents(db, { q: "%", page: 1 })).total).toBe(0);
    expect((await listStudents(db, { q: "'; drop table students;--", page: 1 })).total).toBe(0);
    expect((await listStudents(db, { q: "mya", page: 1 })).total).toBe(1);
    expect((await listStudents(db, { page: 1 })).total).toBe(1);
  });
});
