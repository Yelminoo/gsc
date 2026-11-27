import { z } from "zod";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());

export const loginSchema = z.object({
  email: z.email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(256),
});

export const studentSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the full name").max(120),
  email: z.preprocess(blank, z.email().max(254).optional()),
  phone: text(30),
  dateOfBirth: z.preprocess(blank, z.iso.date().optional()),
  programId: z.preprocess(blank, z.uuid().optional()),
  guardianName: text(120),
  guardianRelationship: text(60),
  guardianPhone: text(30),
});

const amount = (hint: string) => z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/, hint);
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const programSchema = z.object({
  name: z.string().trim().min(2).max(120),
  tuitionFee: amount("Enter an amount like 15000 or 15000.50"),
  hasExam: checkbox,
  examBoard: text(60),
});

export const planSchema = z.object({
  months: z.coerce.number().int().min(1, "At least one month").max(60, "At most 60 months"),
  startDate: z.iso.date(),
  mode: z.enum(["even", "manual"]),
  total: z.preprocess(blank, amount("Enter an amount like 4800000").optional()),
  note: text(200),
});

/** One manual row, named amount-1 / due-1 in the form. */
export const planRowSchema = z.object({
  amount: amount("Enter an amount for every month"),
  dueDate: z.iso.date(),
});

export const examSessionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  examDate: z.iso.date(),
  entryDeadline: z.iso.date(),
}).refine((v) => v.entryDeadline <= v.examDate, {
  message: "The entry deadline must be on or before the exam date",
  path: ["entryDeadline"],
});

export const examFeeSchema = z.object({
  sessionId: z.uuid(),
  programId: z.uuid(),
  feeGbp: amount("Enter the fee in pounds, like 285"),
  resitFeeGbp: z.preprocess(blank, amount("Enter the resit fee in pounds").optional()),
  fxRate: z.string().trim().regex(/^\d{1,7}(\.\d{1,4})?$/, "Enter kyat per 1 GBP, like 2850"),
});

export const examEntrySchema = z.object({
  sessionId: z.uuid(),
  isResit: checkbox,
});

export const settingsSchema = z.object({
  officeEmail: z.preprocess(blank, z.email().max(254).optional()),
  reminderIntervalDays: z.coerce.number().int().min(1).max(90),
  dueSoonDays: z.coerce.number().int().min(1).max(90),
});

export const termSchema = z.object({
  name: z.string().trim().min(2).max(80),
  discountPercent: z.preprocess(blank, z.coerce.number().min(0).max(100).default(0)),
});

export const installmentRow = z.object({
  percentage: z.coerce.number().gt(0).max(100),
  dueOffsetDays: z.coerce.number().int().min(0).max(1825),
});

export const generateInvoicesSchema = z.object({
  studentId: z.uuid(),
  termId: z.uuid(),
});

export const paymentSchema = z.object({
  amount: z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter an amount like 5000 or 5000.50"),
  method: z.enum(["cash", "bank_transfer", "card", "cheque"]),
  reference: text(120),
  paidDate: z.preprocess(blank, z.iso.date().optional()),
});

export const idSchema = z.uuid();
