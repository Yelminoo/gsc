CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."exam_entry_status" AS ENUM('draft', 'entered', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."invoice_kind" AS ENUM('tuition', 'exam', 'other');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('invoice_due_soon', 'invoice_overdue', 'exam_fee_unpaid', 'exam_entry_deadline');--> statement-breakpoint
CREATE TYPE "public"."plan_mode" AS ENUM('even', 'manual');--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_email" text NOT NULL,
	"to_name" text,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"dedupe_key" text NOT NULL,
	"notification_id" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "exam_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"is_resit" boolean DEFAULT false NOT NULL,
	"status" "exam_entry_status" DEFAULT 'draft' NOT NULL,
	"invoice_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"fee_gbp" numeric(10, 2) NOT NULL,
	"resit_fee_gbp" numeric(10, 2),
	"fx_rate" numeric(12, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_fees_gbp_positive" CHECK ("exam_fees"."fee_gbp" > 0),
	CONSTRAINT "exam_fees_rate_positive" CHECK ("exam_fees"."fx_rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "exam_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"exam_date" date NOT NULL,
	"entry_deadline" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_sessions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "installment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"months" integer NOT NULL,
	"mode" "plan_mode" DEFAULT 'even' NOT NULL,
	"start_date" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_months_range" CHECK ("installment_plans"."months" between 1 and 60),
	CONSTRAINT "plans_total_positive" CHECK ("installment_plans"."total" > 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"student_id" uuid,
	"invoice_id" uuid,
	"exam_entry_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "kind" "invoice_kind" DEFAULT 'tuition' NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "has_exam" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "exam_board" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_entries" ADD CONSTRAINT "exam_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_entries" ADD CONSTRAINT "exam_entries_session_id_exam_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_entries" ADD CONSTRAINT "exam_entries_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_entries" ADD CONSTRAINT "exam_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_entries" ADD CONSTRAINT "exam_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_fees" ADD CONSTRAINT "exam_fees_session_id_exam_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_fees" ADD CONSTRAINT "exam_fees_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_exam_entry_id_exam_entries_id_fk" FOREIGN KEY ("exam_entry_id") REFERENCES "public"."exam_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_status_idx" ON "email_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "exam_entries_student_idx" ON "exam_entries" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "exam_entries_session_idx" ON "exam_entries" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "exam_fees_session_idx" ON "exam_fees" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "exam_sessions_date_idx" ON "exam_sessions" USING btree ("exam_date");--> statement-breakpoint
CREATE INDEX "plans_student_idx" ON "installment_plans" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("read_at","created_at");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_plan_id_installment_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE no action ON UPDATE no action;