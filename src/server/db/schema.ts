import {
  pgTable, pgEnum, uuid, text, date, timestamp, numeric, integer, boolean, jsonb, index, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const roleEnum = pgEnum("role", ["admin", "accountant"]);
export const studentStatusEnum = pgEnum("student_status", ["active", "inactive", "graduated", "suspended"]);
// "overdue" is derived from due date and balance, never stored.
export const invoiceStatusEnum = pgEnum("invoice_status", ["issued", "partial", "paid", "void"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "bank_transfer", "card", "cheque"]);
// What an invoice is for. Exam fees are billed separately from tuition so one can be settled
// while the other is not, which is the whole point of tracking exam entries.
export const invoiceKindEnum = pgEnum("invoice_kind", ["tuition", "exam", "other"]);
// How the admin filled in a student's installment plan: split evenly, or amount by amount.
export const planModeEnum = pgEnum("plan_mode", ["even", "manual"]);
// An entry's own lifecycle. Whether the fee is settled is read from its invoice, never stored.
export const examEntryStatusEnum = pgEnum("exam_entry_status", ["draft", "entered", "withdrawn"]);
export const notificationKindEnum = pgEnum("notification_kind", [
  "invoice_due_soon", "invoice_overdue", "exam_fee_unpaid", "exam_entry_deadline",
]);
export const emailStatusEnum = pgEnum("email_status", ["queued", "sent", "failed"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 12, scale: 2 }).notNull();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("accountant"),
  active: boolean("active").notNull().default(true),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: createdAt(),
});

export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

export const programs = pgTable("programs", {
  id: id(),
  name: text("name").notNull().unique(),
  tuitionFee: money("tuition_fee"),
  // Only some programs end in an exam. The fee itself lives in exam_fees, per session,
  // because the board sets it in sterling and it changes from one sitting to the next.
  hasExam: boolean("has_exam").notNull().default(false),
  examBoard: text("exam_board"),
  createdAt: createdAt(),
}, (t) => [check("programs_fee_nonneg", sql`${t.tuitionFee} >= 0`)]);

export const students = pgTable("students", {
  id: id(),
  studentCode: text("student_code").notNull().unique(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  dateOfBirth: date("date_of_birth"),
  enrollmentDate: date("enrollment_date").notNull(),
  programId: uuid("program_id").references(() => programs.id),
  status: studentStatusEnum("status").notNull().default("active"),
  createdAt: createdAt(),
}, (t) => [index("students_name_idx").on(t.fullName), index("students_status_idx").on(t.status)]);

export const guardians = pgTable("guardians", {
  id: id(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  relationship: text("relationship"),
  phone: text("phone"),
});

export const paymentTerms = pgTable("payment_terms", {
  id: id(),
  name: text("name").notNull().unique(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
});

export const paymentTermInstallments = pgTable("payment_term_installments", {
  id: id(),
  termId: uuid("term_id").notNull().references(() => paymentTerms.id, { onDelete: "cascade" }),
  installmentNo: integer("installment_no").notNull(),
  percentage: numeric("percentage", { precision: 5, scale: 2 }).notNull(),
  dueOffsetDays: integer("due_offset_days").notNull().default(0),
});

export const invoices = pgTable("invoices", {
  id: id(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  studentId: uuid("student_id").notNull().references(() => students.id),
  termId: uuid("term_id").references(() => paymentTerms.id),
  // Set when the invoice came from a student's own installment plan rather than a shared term.
  planId: uuid("plan_id").references(() => installmentPlans.id),
  kind: invoiceKindEnum("kind").notNull().default("tuition"),
  installmentNo: integer("installment_no"),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  amount: money("amount"),
  status: invoiceStatusEnum("status").notNull().default("issued"),
  createdAt: createdAt(),
}, (t) => [
  index("invoices_student_idx").on(t.studentId),
  index("invoices_due_idx").on(t.dueDate),
  check("invoices_amount_nonneg", sql`${t.amount} >= 0`),
]);

export const invoiceItems = pgTable("invoice_items", {
  id: id(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: money("unit_price"),
});

export const payments = pgTable("payments", {
  id: id(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  amount: money("amount"),
  paidDate: date("paid_date").notNull(),
  method: paymentMethodEnum("method").notNull(),
  reference: text("reference"),
  recordedBy: uuid("recorded_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  index("payments_invoice_idx").on(t.invoiceId),
  index("payments_date_idx").on(t.paidDate),
  check("payments_amount_positive", sql`${t.amount} > 0`),
]);

/**
 * A student's own payment schedule: so many months from a start date, either split evenly or
 * typed in row by row. Generating the plan raises one invoice per month, so the balance, the
 * receipts and the reminders all reuse the invoice machinery rather than a parallel ledger.
 */
export const installmentPlans = pgTable("installment_plans", {
  id: id(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  total: money("total"),
  months: integer("months").notNull(),
  mode: planModeEnum("mode").notNull().default("even"),
  startDate: date("start_date").notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  index("plans_student_idx").on(t.studentId),
  check("plans_months_range", sql`${t.months} between 1 and 60`),
  check("plans_total_positive", sql`${t.total} > 0`),
]);

/** A sitting: Gem-A runs them on fixed dates with an entry deadline weeks beforehand. */
export const examSessions = pgTable("exam_sessions", {
  id: id(),
  name: text("name").notNull().unique(),
  examDate: date("exam_date").notNull(),
  entryDeadline: date("entry_deadline").notNull(),
  createdAt: createdAt(),
}, (t) => [index("exam_sessions_date_idx").on(t.examDate)]);

/**
 * What one sitting costs for one program. The board prices in sterling, so the rate used on the
 * day is stored alongside the kyat figure: a later rate change must not silently restate an
 * invoice that was already issued.
 */
export const examFees = pgTable("exam_fees", {
  id: id(),
  sessionId: uuid("session_id").notNull().references(() => examSessions.id, { onDelete: "cascade" }),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  feeGbp: numeric("fee_gbp", { precision: 10, scale: 2 }).notNull(),
  resitFeeGbp: numeric("resit_fee_gbp", { precision: 10, scale: 2 }),
  /** Kyat per 1 GBP on the day the fee was set. */
  fxRate: numeric("fx_rate", { precision: 12, scale: 4 }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("exam_fees_session_idx").on(t.sessionId),
  check("exam_fees_gbp_positive", sql`${t.feeGbp} > 0`),
  check("exam_fees_rate_positive", sql`${t.fxRate} > 0`),
]);

/**
 * One student entered for one sitting. "Has the student cleared the exam fee?" is answered from
 * the linked invoice and its payments, the same way an invoice is called overdue: derived, never
 * stored, so it cannot drift away from the money.
 */
export const examEntries = pgTable("exam_entries", {
  id: id(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => examSessions.id, { onDelete: "cascade" }),
  programId: uuid("program_id").notNull().references(() => programs.id),
  isResit: boolean("is_resit").notNull().default(false),
  status: examEntryStatusEnum("status").notNull().default("draft"),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  index("exam_entries_student_idx").on(t.studentId),
  index("exam_entries_session_idx").on(t.sessionId),
]);

/**
 * In-system notifications for staff. dedupeKey carries the reminder's period, so the daily job
 * can run as often as it likes without stacking up the same chase twice.
 */
export const notifications = pgTable("notifications", {
  id: id(),
  kind: notificationKindEnum("kind").notNull(),
  studentId: uuid("student_id").references(() => students.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
  examEntryId: uuid("exam_entry_id").references(() => examEntries.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("notifications_unread_idx").on(t.readAt, t.createdAt)]);

/**
 * Mail is queued here first and sent by the provider adapter, so a provider outage delays a
 * reminder instead of losing it, and every chase that went out stays on the record.
 */
export const emailOutbox = pgTable("email_outbox", {
  id: id(),
  toEmail: text("to_email").notNull(),
  toName: text("to_name"),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  status: emailStatusEnum("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  providerMessageId: text("provider_message_id"),
  dedupeKey: text("dedupe_key").notNull().unique(),
  notificationId: uuid("notification_id").references(() => notifications.id, { onDelete: "set null" }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("email_outbox_status_idx").on(t.status, t.createdAt)]);

/** Small operational settings the office can change without a redeploy (office address, cadence). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  detail: jsonb("detail"),
  createdAt: createdAt(),
});
