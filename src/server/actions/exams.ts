"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db";
import { examFees, examSessions } from "@/server/db/schema";
import { requireUser } from "@/server/auth/dal";
import { enterForExam, withdrawFromExam } from "@/server/services/exams";
import { audit } from "@/server/services/audit";
import { examEntrySchema, examFeeSchema, examSessionSchema, idSchema } from "@/lib/validators";
import { parseForm, toState } from "./helpers";
import type { ActionState } from "./types";

export async function createExamSessionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  const parsed = parseForm(examSessionSchema, formData);
  if (!parsed.ok) return parsed.state;
  try {
    const db = getDb();
    const [s] = await db.insert(examSessions).values(parsed.data).returning({ id: examSessions.id });
    await audit(db, { userId: user.id, action: "exam.session.create", entity: "exam_session", entityId: s.id });
    revalidatePath("/exams");
    return { success: "Exam session added." };
  } catch (e) {
    return toState(e);
  }
}

/**
 * Set what a sitting costs for a program. The sterling price and the rate used are both stored:
 * invoices already issued keep the kyat figure they were billed at.
 */
export async function setExamFeeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  const parsed = parseForm(examFeeSchema, formData);
  if (!parsed.ok) return parsed.state;
  try {
    const db = getDb();
    const [f] = await db.insert(examFees).values(parsed.data).returning({ id: examFees.id });
    await audit(db, { userId: user.id, action: "exam.fee.set", entity: "exam_fee", entityId: f.id, detail: { ...parsed.data } });
    revalidatePath("/exams");
    return { success: "Exam fee saved." };
  } catch (e) {
    return toState(e);
  }
}

export async function enterForExamAction(studentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "accountant"]);
  const parsed = parseForm(examEntrySchema, formData);
  if (!parsed.ok) return parsed.state;
  try {
    const res = await enterForExam(getDb(), { studentId, ...parsed.data, userId: user.id });
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/exams");
    revalidatePath("/invoices");
    revalidatePath("/reports");
    return { success: `Entered. Exam fee invoice ${res.invoice.invoiceNumber} raised.` };
  } catch (e) {
    return toState(e);
  }
}

export async function withdrawFromExamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "accountant"]);
  const id = idSchema.safeParse(formData.get("entryId"));
  if (!id.success) return { error: "Unknown exam entry." };
  try {
    await withdrawFromExam(getDb(), { entryId: id.data, userId: user.id });
    revalidatePath("/exams");
    revalidatePath("/invoices");
    revalidatePath("/reports");
    return { success: "Entry withdrawn and its invoice voided." };
  } catch (e) {
    return toState(e);
  }
}
