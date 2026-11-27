import Link from "next/link";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { listEmailLog, listNotifications } from "@/server/queries";
import { getSettings } from "@/server/services/settings";
import { getEmailProvider } from "@/server/services/email";
import {
  markAllReadAction, markNotificationReadAction, saveReminderSettingsAction, sendRemindersAction,
} from "@/server/actions/notifications";
import { ActionForm, Field } from "@/components/forms/action-form";
import { Band, PageHeader, StatTile, card, sheet, td, tdWrap, th } from "@/components/ui/page";

const KIND_LABEL: Record<string, string> = {
  invoice_overdue: "Overdue",
  invoice_due_soon: "Due soon",
  exam_fee_unpaid: "Exam fee",
  exam_entry_deadline: "Not entered",
};

export default async function RemindersPage() {
  const user = await requireUser();
  const db = getDb();
  const [items, emails, config] = await Promise.all([listNotifications(db), listEmailLog(db), getSettings(db)]);
  const provider = getEmailProvider().name;
  const unread = items.filter((n) => !n.readAt).length;
  const queued = emails.filter((e) => e.status === "queued").length;
  const failed = emails.filter((e) => e.status === "failed").length;

  return (
    <>
      <PageHeader
        eyebrow="Follow-up"
        title="Reminders"
        actions={
          <ActionForm action={sendRemindersAction} submitLabel="Send reminders now" className="" />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Unread" value={String(unread)} tone={unread > 0 ? "alert" : undefined} />
        <StatTile label="Queued email" value={String(queued)} />
        <StatTile label="Failed email" value={String(failed)} tone={failed > 0 ? "alert" : undefined} />
        <StatTile
          label="Provider"
          value={provider === "brevo" ? "Brevo" : "Log only"}
          hint={provider === "brevo" ? "Sent through the Brevo API" : "Set EMAIL_PROVIDER=brevo to send for real"}
        />
      </div>

      <Band label="Notification centre" />
      <section className={sheet}>
        <table className="min-w-full divide-y divide-line">
          <thead>
            <tr><th className={th}>What</th><th className={th}>Detail</th><th className={th}>Raised</th><th className={th}></th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((n) => (
              <tr key={n.id} className={n.readAt ? "opacity-55" : undefined}>
                <td className={td}>
                  <span className="inline-flex items-center gap-2">
                    {!n.readAt && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />}
                    {KIND_LABEL[n.kind] ?? n.kind}
                  </span>
                </td>
                <td className={tdWrap}>
                  <span className="text-ink">{n.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{n.body}</span>
                  <span className="mt-1 block text-xs">
                    {n.studentId && (
                      <Link className="text-gold underline decoration-gold/40 underline-offset-4" href={`/students/${n.studentId}`}>Student</Link>
                    )}
                    {n.invoiceId && (
                      <Link className="ml-3 text-gold underline decoration-gold/40 underline-offset-4" href={`/invoices/${n.invoiceId}`}>Invoice</Link>
                    )}
                  </span>
                </td>
                <td className={`${td} tabular-nums`}>{String(n.createdAt).slice(0, 10)}</td>
                <td className={td}>
                  {!n.readAt && (
                    <ActionForm action={markNotificationReadAction} submitLabel="Mark read" quiet className="">
                      <input type="hidden" name="notificationId" value={n.id} />
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className={td} colSpan={4}>Nothing to chase. Press Send reminders now to run a sweep.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {unread > 0 && (
        <div className="mt-4">
          <ActionForm action={markAllReadAction} submitLabel="Mark all as read" quiet className="" />
        </div>
      )}

      <Band label="Email log" />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className={`${sheet} lg:col-span-2`}>
          <table className="min-w-full divide-y divide-line">
            <thead><tr><th className={th}>To</th><th className={th}>Subject</th><th className={th}>Status</th><th className={th}>Sent</th></tr></thead>
            <tbody className="divide-y divide-line">
              {emails.map((e) => (
                <tr key={e.id}>
                  <td className={td}>{e.toEmail}</td>
                  <td className={tdWrap}>
                    {e.subject}
                    {e.lastError && <span className="mt-0.5 block text-xs text-bad">{e.lastError}</span>}
                  </td>
                  <td className={td}>
                    <span className={e.status === "sent" ? "text-ok" : e.status === "failed" ? "text-bad" : "text-muted"}>
                      {e.status}
                    </span>
                    {e.attempts > 1 && <span className="ml-2 text-xs text-muted">{e.attempts} tries</span>}
                  </td>
                  <td className={`${td} tabular-nums`}>{e.sentAt ? String(e.sentAt).slice(0, 16).replace("T", " ") : "-"}</td>
                </tr>
              ))}
              {emails.length === 0 && <tr><td className={td} colSpan={4}>No email yet.</td></tr>}
            </tbody>
          </table>
        </section>

        {user.role === "admin" && (
          <section className={card}>
            <h3 className="mb-5 font-display text-xl font-medium tracking-tight text-ink">Settings</h3>
            <ActionForm action={saveReminderSettingsAction} submitLabel="Save settings">
              <Field
                name="officeEmail" label="Office copy" type="email" defaultValue={config.office_email}
                placeholder="office@gsc.school" hint="A daily digest of everything chased. Leave blank for none."
              />
              <Field
                name="reminderIntervalDays" label="Days between reminders" type="number"
                defaultValue={config.reminder_interval_days}
                hint="The same student is not chased again about the same thing inside this window."
              />
              <Field
                name="dueSoonDays" label="Warn this many days before a due date" type="number"
                defaultValue={config.due_soon_days}
              />
            </ActionForm>
            <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-muted">
              The sweep also runs on a schedule. Set REMINDER_JOB_IN_PROCESS=1 to run it from the app each
              morning, or POST to /api/jobs/reminders with REMINDER_JOB_SECRET from Task Scheduler or cron.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
