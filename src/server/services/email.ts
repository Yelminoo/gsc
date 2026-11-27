import { and, asc, eq, lt, sql } from "drizzle-orm";
import { emailOutbox } from "@/server/db/schema";
import type { DB } from "@/server/db/types";
import { getEmailEnv } from "@/lib/env";

export type OutgoingEmail = {
  toEmail: string;
  toName?: string | null;
  subject: string;
  bodyText: string;
};

export type SendResult = { ok: true; messageId?: string } | { ok: false; error: string };

/**
 * One provider, one file. Swapping Brevo for SMTP or Resend means writing another object with
 * this shape and naming it in EMAIL_PROVIDER; nothing else in the app knows who sends the mail.
 */
export interface EmailProvider {
  readonly name: string;
  send(mail: OutgoingEmail): Promise<SendResult>;
}

/** Brevo's transactional endpoint. The key is read per call so rotating it needs no restart. */
const brevo: EmailProvider = {
  name: "brevo",
  async send(mail) {
    const env = getEmailEnv();
    if (!env.BREVO_API_KEY) return { ok: false, error: "BREVO_API_KEY is not set" };
    if (!env.EMAIL_FROM) return { ok: false, error: "EMAIL_FROM is not set" };
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
          to: [{ email: mail.toEmail, ...(mail.toName ? { name: mail.toName } : {}) }],
          subject: mail.subject,
          textContent: mail.bodyText,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { ok: false, error: `Brevo returned ${res.status}: ${(await res.text()).slice(0, 300)}` };
      const json = (await res.json().catch(() => ({}))) as { messageId?: string };
      return { ok: true, messageId: json.messageId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
    }
  },
};

/** The default: writes the mail to the server log so local testing needs no account anywhere. */
const consoleProvider: EmailProvider = {
  name: "console",
  async send(mail) {
    console.info(`[email] to=${mail.toEmail} subject=${JSON.stringify(mail.subject)}`);
    return { ok: true };
  },
};

export function getEmailProvider(): EmailProvider {
  return getEmailEnv().EMAIL_PROVIDER === "brevo" ? brevo : consoleProvider;
}

/**
 * Put a mail in the outbox. dedupeKey makes this idempotent, so a sweep that runs twice in a
 * morning does not mail the same student twice; the second insert is simply ignored.
 */
export async function queueEmail(
  db: DB,
  mail: OutgoingEmail & { dedupeKey: string; notificationId?: string },
): Promise<boolean> {
  const inserted = await db.insert(emailOutbox).values({
    toEmail: mail.toEmail,
    toName: mail.toName ?? null,
    subject: mail.subject,
    bodyText: mail.bodyText,
    dedupeKey: mail.dedupeKey,
    notificationId: mail.notificationId,
  }).onConflictDoNothing({ target: emailOutbox.dedupeKey }).returning({ id: emailOutbox.id });
  return inserted.length > 0;
}

const MAX_ATTEMPTS = 5;

/**
 * Send what is queued. Failures stay in the outbox with the reason and are retried on the next
 * pass, up to MAX_ATTEMPTS, after which they are marked failed and left for someone to look at.
 */
export async function flushOutbox(db: DB, limit = 50) {
  const provider = getEmailProvider();
  const pending = await db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, "queued"), lt(emailOutbox.attempts, MAX_ATTEMPTS)))
    .orderBy(asc(emailOutbox.createdAt))
    .limit(limit);

  let sent = 0, failed = 0;
  for (const mail of pending) {
    const result = await provider.send(mail);
    if (result.ok) {
      await db.update(emailOutbox).set({
        status: "sent",
        attempts: mail.attempts + 1,
        sentAt: sql`now()`,
        providerMessageId: result.messageId ?? null,
        lastError: null,
      }).where(eq(emailOutbox.id, mail.id));
      sent += 1;
    } else {
      const attempts = mail.attempts + 1;
      await db.update(emailOutbox).set({
        status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
        attempts,
        lastError: result.error.slice(0, 1000),
      }).where(eq(emailOutbox.id, mail.id));
      failed += 1;
    }
  }
  return { provider: provider.name, considered: pending.length, sent, failed };
}
