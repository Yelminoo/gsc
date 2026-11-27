"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { createPlan } from "@/server/services/plans";
import { toPya } from "@/lib/money";
import { planRowSchema, planSchema } from "@/lib/validators";
import { parseForm, toState } from "./helpers";
import type { ActionState } from "./types";

/**
 * Build a student's installment plan. studentId comes from the page, not the form, and the role
 * is checked here as well: a server action is a public endpoint like any other.
 */
export async function createPlanAction(studentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "accountant"]);
  const parsed = parseForm(planSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { months, startDate, mode, total, note } = parsed.data;

  try {
    if (mode === "manual") {
      const rows = [];
      for (let i = 0; i < months; i++) {
        const row = planRowSchema.safeParse({
          amount: formData.get(`amount-${i}`),
          dueDate: formData.get(`due-${i}`),
        });
        if (!row.success) return { error: `Check the amount and date for month ${i + 1}.` };
        rows.push({ dueDate: row.data.dueDate, amountPya: toPya(row.data.amount) });
      }
      const res = await createPlan(getDb(), { studentId, months, startDate, rows, note, userId: user.id });
      return done(studentId, res.invoices.length);
    }

    if (!total) return { error: "Enter the total to divide across the months.", fieldErrors: { total: ["Required"] } };
    const res = await createPlan(getDb(), { studentId, months, startDate, totalPya: toPya(total), note, userId: user.id });
    return done(studentId, res.invoices.length);
  } catch (e) {
    return toState(e);
  }
}

function done(studentId: string, count: number): ActionState {
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/invoices");
  revalidatePath("/reports");
  return { success: `Plan created. ${count} monthly invoice${count === 1 ? "" : "s"} raised.` };
}
