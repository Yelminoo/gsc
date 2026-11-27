"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { recordPayment, voidInvoice } from "@/server/services/invoicing";
import { toPya } from "@/lib/money";
import { idSchema, paymentSchema } from "@/lib/validators";
import { isRedirect, parseForm, toState } from "./helpers";
import type { ActionState } from "./types";

export async function recordPaymentAction(invoiceId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "accountant"]);
  if (!idSchema.safeParse(invoiceId).success) return { error: "Invoice not found." };
  const parsed = parseForm(paymentSchema, formData);
  if (!parsed.ok) return parsed.state;
  try {
    const res = await recordPayment(getDb(), {
      invoiceId,
      amountPya: toPya(parsed.data.amount),
      method: parsed.data.method,
      reference: parsed.data.reference,
      paidDate: parsed.data.paidDate,
      userId: user.id,
    });
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/invoices");
    revalidatePath("/payments");
    revalidatePath("/reports");
    return { success: res.status === "paid" ? "Payment recorded. Invoice is fully paid." : "Payment recorded." };
  } catch (e) {
    return toState(e);
  }
}

export async function voidInvoiceAction(invoiceId: string): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  if (!idSchema.safeParse(invoiceId).success) return { error: "Invoice not found." };
  try {
    await voidInvoice(getDb(), { invoiceId, userId: user.id });
  } catch (e) {
    if (isRedirect(e)) throw e;
    return toState(e);
  }
  revalidatePath("/invoices");
  revalidatePath("/reports");
  redirect("/invoices");
}
