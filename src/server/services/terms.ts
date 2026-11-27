import { paymentTermInstallments, paymentTerms } from "@/server/db/schema";
import type { DB } from "@/server/db/types";
import { percentToBp } from "@/lib/money";
import { audit } from "./audit";
import { DomainError } from "./errors";

export async function createPaymentTerm(
  db: DB,
  input: { name: string; discountPercent: number; installments: { percentage: number; dueOffsetDays: number }[]; userId: string },
) {
  if (input.installments.length === 0) throw new DomainError("Add at least one installment");
  const bp = input.installments.reduce((a, r) => a + percentToBp(r.percentage), 0);
  if (bp !== 10000) throw new DomainError("Installment percentages must add up to exactly 100%");

  return db.transaction(async (tx) => {
    const [term] = await tx.insert(paymentTerms).values({
      name: input.name,
      discountPercent: input.discountPercent.toFixed(2),
    }).returning({ id: paymentTerms.id });
    await tx.insert(paymentTermInstallments).values(
      input.installments.map((r, i) => ({
        termId: term.id,
        installmentNo: i + 1,
        percentage: r.percentage.toFixed(2),
        dueOffsetDays: r.dueOffsetDays,
      })),
    );
    await audit(tx, { userId: input.userId, action: "term.create", entity: "payment_term", entityId: term.id });
    return term;
  });
}
