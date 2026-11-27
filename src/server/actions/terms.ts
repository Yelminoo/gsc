"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { createPaymentTerm } from "@/server/services/terms";
import { installmentRow, termSchema } from "@/lib/validators";
import { formObject, parseForm, toState } from "./helpers";
import type { ActionState } from "./types";

const MAX_ROWS = 12;

export async function createTermAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  const parsed = parseForm(termSchema, formData);
  if (!parsed.ok) return parsed.state;

  const raw = formObject(formData);
  const installments: { percentage: number; dueOffsetDays: number }[] = [];
  for (let i = 1; i <= MAX_ROWS; i++) {
    const pct = raw[`pct${i}`]?.trim();
    if (!pct) continue;
    const row = installmentRow.safeParse({ percentage: pct, dueOffsetDays: raw[`days${i}`]?.trim() || "0" });
    if (!row.success) return { error: `Installment ${i} is not valid (percentage 0-100, days 0 or more).` };
    installments.push(row.data);
  }
  try {
    await createPaymentTerm(getDb(), { ...parsed.data, installments, userId: user.id });
    revalidatePath("/terms");
    return { success: "Payment term created." };
  } catch (e) {
    return toState(e);
  }
}
