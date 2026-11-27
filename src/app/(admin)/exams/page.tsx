import Link from "next/link";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { listExamSessions, listPrograms } from "@/server/queries";
import { listExamEntries } from "@/server/services/exams";
import { createExamSessionAction, setExamFeeAction, withdrawFromExamAction } from "@/server/actions/exams";
import { ActionForm, Field, Select } from "@/components/forms/action-form";
import { Band, PageHeader, StatTile, card, sheet, td, tdWrap, th } from "@/components/ui/page";
import { formatMMK, gbpToPya } from "@/lib/money";

export default async function ExamsPage() {
  const user = await requireUser();
  const db = getDb();
  const [sessions, programs, entries] = await Promise.all([
    listExamSessions(db),
    listPrograms(db),
    listExamEntries(db),
  ]);
  const examPrograms = programs.filter((p) => p.hasExam);
  const unpaid = entries.filter((e) => !e.cleared);
  const owed = unpaid.reduce((sum, e) => sum + Math.max(e.feePya - e.paidPya, 0), 0);

  return (
    <>
      <PageHeader eyebrow="Examinations" title="Exam entries and fees" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Entries" value={String(entries.length)} />
        <StatTile label="Fee cleared" value={String(entries.length - unpaid.length)} />
        <StatTile label="Not cleared" value={String(unpaid.length)} tone={unpaid.length > 0 ? "alert" : undefined} />
        <StatTile label="Outstanding" value={formatMMK(owed)} hint="Exam fees still to collect" />
      </div>

      <Band label="Entries" />
      <section className={sheet}>
        <table className="min-w-full divide-y divide-line">
          <thead>
            <tr>
              <th className={th}>Student</th><th className={th}>Sitting</th><th className={th}>Program</th>
              <th className={th}>Fee</th><th className={th}>Paid</th><th className={th}>Exam fee</th><th className={th}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((e) => (
              <tr key={e.entryId}>
                <td className={td}>
                  <Link className="text-gold transition-colors hover:text-gold-soft" href={`/students/${e.studentId}`}>{e.studentName}</Link>
                  <span className="ml-2 text-xs text-muted">{e.studentCode}</span>
                </td>
                <td className={td}>{e.sessionName}</td>
                <td className={td}>{e.programName}{e.isResit && <span className="ml-2 text-xs text-muted">resit</span>}</td>
                <td className={`${td} tabular-nums`}>{formatMMK(e.feePya)}</td>
                <td className={`${td} tabular-nums`}>{formatMMK(e.paidPya)}</td>
                <td className={td}><ClearedBadge cleared={e.cleared} /></td>
                <td className={td}>
                  {e.invoiceId && (
                    <Link className="text-xs text-muted underline decoration-line underline-offset-4 hover:text-ink" href={`/invoices/${e.invoiceId}`}>
                      {e.invoiceNumber}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td className={td} colSpan={7}>No exam entries yet. Enter a student from their page.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <Band label="Sittings" />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className={`${sheet} lg:col-span-2`}>
          <table className="min-w-full divide-y divide-line">
            <thead>
              <tr><th className={th}>Sitting</th><th className={th}>Exam date</th><th className={th}>Entries close</th><th className={th}>Fees</th><th className={th}>Unpaid</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className={td}>{s.name}</td>
                  <td className={`${td} tabular-nums`}>{s.examDate}</td>
                  <td className={`${td} tabular-nums`}>{s.entryDeadline}</td>
                  <td className={tdWrap}>
                    {s.fees.length === 0
                      ? <span className="text-muted">No fee set</span>
                      : s.fees.map((f) => (
                          // One fee per line: several programs in a row would widen the table
                          // past its column and the figures would scroll out of sight.
                          <span key={f.programId} className="block">
                            {f.program}: £{f.feeGbp}
                            <span className="ml-1 tabular-nums text-muted">{formatMMK(gbpToPya(f.feeGbp, f.fxRate))}</span>
                          </span>
                        ))}
                  </td>
                  <td className={`${td} tabular-nums`}>{s.unpaid > 0 ? <span className="text-bad">{s.unpaid}</span> : s.unpaid}</td>
                </tr>
              ))}
              {sessions.length === 0 && <tr><td className={td} colSpan={5}>No sittings yet.</td></tr>}
            </tbody>
          </table>
        </section>

        {user.role === "admin" && (
          <div className="space-y-6">
            <section className={card}>
              <h3 className="mb-5 font-display text-xl font-medium tracking-tight text-ink">Add a sitting</h3>
              <ActionForm action={createExamSessionAction} submitLabel="Add sitting" resetOnSuccess>
                <Field name="name" label="Name" required placeholder="Gem-A Diploma, January 2027" />
                <Field name="examDate" label="Exam date" type="date" required />
                <Field name="entryDeadline" label="Entries close" type="date" required />
              </ActionForm>
            </section>

            <section className={card}>
              <h3 className="mb-5 font-display text-xl font-medium tracking-tight text-ink">Set an exam fee</h3>
              {sessions.length === 0 || examPrograms.length === 0 ? (
                <p className="text-sm text-muted">
                  Add a sitting first, and mark at least one program as having an exam on the{" "}
                  <Link className="text-gold underline decoration-gold/40 underline-offset-4" href="/programs">Programs</Link> page.
                </p>
              ) : (
                <ActionForm action={setExamFeeAction} submitLabel="Save fee" resetOnSuccess>
                  <Field name="sessionId" label="Sitting" required>
                    <Select name="sessionId" required placeholder="Choose a sitting" options={sessions.map((s) => ({ value: s.id, label: s.name }))} />
                  </Field>
                  <Field name="programId" label="Program" required>
                    <Select name="programId" required placeholder="Choose a program" options={examPrograms.map((p) => ({ value: p.id, label: p.name }))} />
                  </Field>
                  <Field name="feeGbp" label="Fee (GBP)" required placeholder="285" />
                  <Field name="resitFeeGbp" label="Resit fee (GBP)" placeholder="Leave blank to charge the same" />
                  <Field name="fxRate" label="Kyat per 1 GBP" required placeholder="2850"
                    hint="Stored with the fee, so invoices already issued keep the rate they were billed at." />
                </ActionForm>
              )}
            </section>
          </div>
        )}
      </div>

      {unpaid.length > 0 && (
        <section className={`${card} mt-10`}>
          <h3 className="mb-4 font-display text-xl font-medium tracking-tight text-ink">Withdraw an entry</h3>
          <p className="mb-4 text-sm text-muted">
            Withdrawing voids the exam fee invoice. An entry whose fee has already been paid must be refunded first.
          </p>
          <ActionForm action={withdrawFromExamAction} submitLabel="Withdraw" danger className="flex flex-wrap items-end gap-3">
            <Field name="entryId" label="Entry">
              <Select
                name="entryId" required placeholder="Choose an entry"
                options={unpaid.map((e) => ({ value: e.entryId, label: `${e.studentName} — ${e.sessionName}` }))}
              />
            </Field>
          </ActionForm>
        </section>
      )}
    </>
  );
}

function ClearedBadge({ cleared }: { cleared: boolean }) {
  return cleared ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/25 bg-ok/[0.08] px-2.5 py-1 text-xs font-medium text-ok">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />Cleared
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-bad/25 bg-bad/[0.08] px-2.5 py-1 text-xs font-medium text-bad">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-bad" />Not cleared
    </span>
  );
}
