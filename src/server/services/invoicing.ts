import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  invoiceItems, invoices, payments, paymentTermInstallments, paymentTerms, programs, students,
} from "@/server/db/schema";
import type { DB } from "@/server/db/types";
import { addDays, today } from "@/lib/dates";
import { applyDiscountBp, percentToBp, splitByBp, toNumeric, toPya } from "@/lib/money";
import { nextCounter } from "./counters";
import { audit } from "./audit";
import { DomainError } from "./errors";

export async function generateInvoices(db: DB, input: { studentId: string; termId: string; userId: string }) {
  return db.transaction(async (tx) => {
    const [student] = await tx.select().from(students).where(eq(students.id, input.studentId)).for("update");
    if (!student) throw new DomainError("Student not found");
    if (!student.programId) throw new DomainError("Assign a program to this student first");

    const [program] = await tx.select().from(programs).where(eq(programs.id, student.programId));
    const [term] = await tx.select().from(paymentTerms).where(eq(paymentTerms.id, input.termId));
    if (!term) throw new DomainError("Payment term not found");

    const rows = await tx
      .select()
      .from(paymentTermInstallments)
      .where(eq(paymentTermInstallments.termId, term.id))
      .orderBy(asc(paymentTermInstallments.installmentNo));
    if (rows.length === 0) throw new DomainError("This payment term has no installments");

    const existing = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.studentId, student.id), eq(invoices.termId, term.id), ne(invoices.status, "void")));
    if (existing.length > 0) throw new DomainError("Invoices for this student and term already exist");

    const gross = toPya(program.tuitionFee);
    const total = applyDiscountBp(gross, percentToBp(term.discountPercent));
    const parts = splitByBp(total, rows.map((r) => percentToBp(r.percentage)));

    const issueDate = today();
    const year = issueDate.slice(0, 4);
    const created: { id: string; invoiceNumber: string }[] = [];

    for (const [i, row] of rows.entries()) {
      const seq = await nextCounter(tx, `invoice-${year}`);
      const invoiceNumber = `INV-${year}-${String(seq).padStart(6, "0")}`;
      const [inv] = await tx.insert(invoices).values({
        invoiceNumber,
        studentId: student.id,
        termId: term.id,
        installmentNo: row.installmentNo,
        issueDate,
        dueDate: addDays(issueDate, row.dueOffsetDays),
        amount: toNumeric(parts[i]),
      }).returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });

      await tx.insert(invoiceItems).values({
        invoiceId: inv.id,
        description: `${program.name} tuition (${term.name}, installment ${row.installmentNo} of ${rows.length})`,
        quantity: 1,
        unitPrice: toNumeric(parts[i]),
      });
      created.push(inv);
    }
    await audit(tx, {
      userId: input.userId, action: "invoice.generate", entity: "student", entityId: student.id,
      detail: { termId: term.id, invoices: created.map((c) => c.invoiceNumber), total: toNumeric(total) },
    });
    return created;
  });
}

export async function recordPayment(
  db: DB,
  input: { invoiceId: string; amountPya: number; method: "cash" | "bank_transfer" | "card" | "cheque"; reference?: string; paidDate?: string; userId: string },
) {
  if (!Number.isInteger(input.amountPya) || input.amountPya <= 0) throw new DomainError("Amount must be greater than zero");
  return db.transaction(async (tx) => {
    // Row lock serialises concurrent payments on the same invoice (no overpayment race).
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).for("update");
    if (!inv) throw new DomainError("Invoice not found");
    if (inv.status === "void") throw new DomainError("This invoice is void");

    const [{ paid }] = await tx
      .select({ paid: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(eq(payments.invoiceId, inv.id));
    const outstanding = toPya(inv.amount) - toPya(paid);
    if (outstanding <= 0) throw new DomainError("This invoice is already fully paid");
    if (input.amountPya > outstanding) throw new DomainError("Payment is larger than the outstanding balance");

    const paidDate = input.paidDate ?? today();
    if (paidDate > today()) throw new DomainError("Payment date cannot be in the future");

    const [payment] = await tx.insert(payments).values({
      invoiceId: inv.id,
      amount: toNumeric(input.amountPya),
      paidDate,
      method: input.method,
      reference: input.reference,
      recordedBy: input.userId,
    }).returning({ id: payments.id });

    const status = input.amountPya === outstanding ? "paid" : "partial";
    await tx.update(invoices).set({ status }).where(eq(invoices.id, inv.id));
    await audit(tx, {
      userId: input.userId, action: "payment.record", entity: "invoice", entityId: inv.id,
      detail: { paymentId: payment.id, amount: toNumeric(input.amountPya), method: input.method },
    });
    return { paymentId: payment.id, status };
  });
}

export async function voidInvoice(db: DB, input: { invoiceId: string; userId: string }) {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).for("update");
    if (!inv) throw new DomainError("Invoice not found");
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.invoiceId, inv.id));
    if (n > 0) throw new DomainError("An invoice with payments cannot be voided");
    await tx.update(invoices).set({ status: "void" }).where(eq(invoices.id, inv.id));
    await audit(tx, { userId: input.userId, action: "invoice.void", entity: "invoice", entityId: inv.id });
  });
}
