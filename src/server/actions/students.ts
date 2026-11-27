"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db";
import { programs } from "@/server/db/schema";
import { requireUser } from "@/server/auth/dal";
import { registerStudent } from "@/server/services/students";
import { generateInvoices } from "@/server/services/invoicing";
import { audit } from "@/server/services/audit";
import { toNumeric, toPya } from "@/lib/money";
import { generateInvoicesSchema, programSchema, studentSchema } from "@/lib/validators";
import { isRedirect, parseForm, toState } from "./helpers";
import type { ActionState } from "./types";

export async function createStudentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "accountant"]);
  const parsed = parseForm(studentSchema, formData);
  if (!parsed.ok) return parsed.state;
  let id: string;
  try {
    id = (await registerStudent(getDb(), parsed.data, user.id)).id;
  } catch (e) {
    if (isRedirect(e)) throw e;
    return toState(e);
  }
  redirect(`/students/${id}`);
}

export async function createProgramAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  const parsed = parseForm(programSchema, formData);
  if (!parsed.ok) return parsed.state;
  try {
    const db = getDb();
    const [p] = await db.insert(programs).values({
      name: parsed.data.name,
      tuitionFee: toNumeric(toPya(parsed.data.tuitionFee)),
      hasExam: parsed.data.hasExam,
      examBoard: parsed.data.hasExam ? parsed.data.examBoard : null,
    }).returning({ id: programs.id });
    await audit(db, { userId: user.id, action: "program.create", entity: "program", entityId: p.id });
    revalidatePath("/programs");
    return { success: "Program added." };
  } catch (e) {
    return toState(e);
  }
}

/** studentId is bound by the page, but is re-validated here: never trust client-supplied ids. */
export async function generateInvoicesAction(studentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "accountant"]);
  const input = generateInvoicesSchema.safeParse({ studentId, termId: formData.get("termId") });
  if (!input.success) return { error: "Choose a payment term." };
  try {
    const created = await generateInvoices(getDb(), { ...input.data, userId: user.id });
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/invoices");
    revalidatePath("/reports");
    return { success: `Created ${created.length} invoice(s): ${created.map((c) => c.invoiceNumber).join(", ")}` };
  } catch (e) {
    return toState(e);
  }
}
