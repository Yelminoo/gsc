import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Lets an outside scheduler run the daily sweep. Without it the job route is closed to
  // everyone, so a missing secret fails shut rather than leaving an open endpoint.
  REMINDER_JOB_SECRET: z.string().min(16).optional(),
});

/**
 * Email settings, parsed on their own.
 *
 * Kept apart from the schema above so that sending mail does not drag in the database and
 * session secrets: the outbox is exercised in tests that have neither, and a reminder sweep
 * should not fail over an unrelated missing variable. Everything here is optional, so with no
 * provider configured the app still records its reminders, it just does not post them anywhere.
 */
const emailSchema = z.object({
  EMAIL_PROVIDER: z.enum(["brevo", "console"]).default("console"),
  BREVO_API_KEY: z.string().optional(),
  EMAIL_FROM: z.preprocess((v) => (v === "" ? undefined : v), z.email().optional()),
  EMAIL_FROM_NAME: z.string().default("GSC Gemmological School"),
});

let cached: z.infer<typeof schema> | undefined;

/** Validated environment, read lazily so `next build` does not need secrets. */
export function getEnv() {
  cached ??= schema.parse(process.env);
  return cached;
}

let cachedEmail: z.infer<typeof emailSchema> | undefined;

export function getEmailEnv() {
  cachedEmail ??= emailSchema.parse(process.env);
  return cachedEmail;
}
