import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { getStudent, listExamSessions, listTerms } from "@/server/queries";
import { listExamEntries } from "@/server/services/exams";
import { planSummary } from "@/server/services/plans";
import { generateInvoicesAction } from "@/server/actions/students";
import { enterForExamAction } from "@/server/actions/exams";
import { ActionForm, Checkbox, Field, Select } from "@/components/forms/action-form";
import { PlanBuilder } from "@/components/forms/plan-builder";
import { Band, InvoiceBadge, PageHeader, card, sheet, td, th } from "@/components/ui/page";
import { formatMMK, mmk, toPya } from "@/lib/money";
import { idSchema } from "@/lib/validators";

export default async function StudentPage(props: PageProps<"/students/[id]">) {
  await requireUser();
  const { id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();
  const db = getDb();
  const data = await getStudent(db, id);
  if (!data) notFound();
  const [terms, plan, entries, sessions] = await Promise.all([
    listTerms(db),
    planSummary(db, id),
    listExamEntries(db, { studentId: id }),
    listExamSessions(db),
  ]);
  const { student, guardians, invoices } = data;
  // Tuition already being billed, from a plan or a shared term. A second schedule on top of it
  // would bill the student twice, so the builder is only offered when there is none.
  const billed = invoices.filter((i) => i.kind !== "exam" && i.status !== "void");
  // Only sittings the student is not already down for, and that have not already been sat.
  const entered = new Set(entries.map((e) => e.sessionId));
  const openSessions = sessions.filter((s) => !entered.has(s.id) && s.fees.length > 0);
  const hasExam = sessions.some((s) => s.fees.some((f) => f.programId === student.programId));

  return (
    <>
      <PageHeader eyebrow="Student" title={student.fullName} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className={card}>
          <h2 className="mb-5 font-display text-xl font-medium tracking-tight text-ink">Details</h2>
          <dl className="space-y-1 text-sm">
            <div><dt className="inline text-muted">Code: </dt><dd className="inline">{student.studentCode}</dd></div>
            <div><dt className="inline text-muted">Program: </dt><dd className="inline">{student.program ?? "Not assigned"}{student.tuitionFee ? ` (${mmk(student.tuitionFee)})` : ""}</dd></div>
            <div><dt className="inline text-muted">Status: </dt><dd className="inline">{student.status}</dd></div>
            <div><dt className="inline text-muted">Enrolled: </dt><dd className="inline">{student.enrollmentDate}</dd></div>
            <div><dt className="inline text-muted">Email: </dt><dd className="inline">{student.email ?? "-"}</dd></div>
            <div><dt className="inline text-muted">Phone: </dt><dd className="inline">{student.phone ?? "-"}</dd></div>
            <div><dt className="inline text-muted">Date of birth: </dt><dd className="inline">{student.dateOfBirth ?? "-"}</dd></div>
          </dl>
          {!student.email && (
            <p className="mt-4 rounded-lg border border-warn/25 bg-warn/[0.07] px-3 py-2 text-xs text-warn">
              No email address, so this student cannot be sent payment reminders.
            </p>
          )}
          {guardians.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Guardians</h3>
              <ul className="space-y-1 text-sm">
                {guardians.map((g) => <li key={g.id}>{g.name}{g.relationship ? ` (${g.relationship})` : ""} {g.phone ?? ""}</li>)}
              </ul>
            </>
          )}
        </section>

        <section className={`${card} lg:col-span-2`}>
          <h2 className="mb-5 font-display text-xl font-medium tracking-tight text-ink">Payment plan</h2>
          {plan ? (
            <>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Stat label="Billed" value={formatMMK(plan.totalPya)} />
                <Stat label="Paid" value={formatMMK(plan.paidPya)} />
                <Stat label="Remaining" value={formatMMK(plan.remainingPya)} tone={plan.remainingPya > 0 ? "gold" : undefined} />
              </dl>
              <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
                {plan.months} month{plan.months === 1 ? "" : "s"} from {plan.startDate}, {plan.mode === "even" ? "divided evenly" : "set month by month"}.
                {plan.nextDue
                  ? <> Next due {plan.nextDue.dueDate}: <Link className="text-gold underline decoration-gold/40 underline-offset-4" href={`/invoices/${plan.nextDue.invoiceId}`}>{plan.nextDue.invoiceNumber}</Link> for {formatMMK(plan.nextDue.outstandingPya)}.</>
                  : " Nothing left to pay."}
                {plan.overdueCount > 0 && <span className="text-bad"> {plan.overdueCount} month{plan.overdueCount === 1 ? " is" : "s are"} overdue.</span>}
              </p>
            </>
          ) : billed.length > 0 ? (
            <p className="text-sm text-muted">
              This student is already billed on {billed.length} invoice{billed.length === 1 ? "" : "s"} from a shared
              payment term. Void those invoices to replace them with a monthly plan.
            </p>
          ) : student.programId ? (
            <PlanBuilder studentId={student.id} suggestedTotal={student.tuitionFee ? String(Math.round(toPya(student.tuitionFee) / 100)) : undefined} />
          ) : (
            <p className="text-sm text-muted">Assign a program to this student before building a plan.</p>
          )}
        </section>
      </div>

      {hasExam && (
        <>
          <Band label="Examinations" />
          <div className="grid gap-6 lg:grid-cols-3">
            <section className={`${sheet} lg:col-span-2`}>
              <table className="min-w-full divide-y divide-line">
                <thead><tr><th className={th}>Sitting</th><th className={th}>Fee</th><th className={th}>Paid</th><th className={th}>Exam fee</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {entries.map((e) => (
                    <tr key={e.entryId}>
                      <td className={td}>
                        {e.sessionName}
                        {e.isResit && <span className="ml-2 text-xs text-muted">resit</span>}
                        <span className="mt-0.5 block text-xs text-muted">Exam {e.examDate}, entries close {e.entryDeadline}</span>
                      </td>
                      <td className={`${td} tabular-nums`}>{formatMMK(e.feePya)}</td>
                      <td className={`${td} tabular-nums`}>{formatMMK(e.paidPya)}</td>
                      <td className={td}>
                        {e.cleared
                          ? <span className="text-ok">Cleared</span>
                          : <span className="text-bad">Not cleared</span>}
                        {e.invoiceId && (
                          <Link className="ml-3 text-xs text-muted underline decoration-line underline-offset-4 hover:text-ink" href={`/invoices/${e.invoiceId}`}>
                            {e.invoiceNumber}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && <tr><td className={td} colSpan={4}>Not entered for any sitting yet.</td></tr>}
                </tbody>
              </table>
            </section>

            <section className={card}>
              <h3 className="mb-5 font-display text-xl font-medium tracking-tight text-ink">Enter for an exam</h3>
              {openSessions.length === 0 ? (
                <p className="text-sm text-muted">
                  No sitting is open for this program. Add one on the{" "}
                  <Link className="text-gold underline decoration-gold/40 underline-offset-4" href="/exams">Exams</Link> page.
                </p>
              ) : (
                <ActionForm action={enterForExamAction.bind(null, student.id)} submitLabel="Enter and raise the fee">
                  <Field name="sessionId" label="Sitting" required>
                    <Select name="sessionId" required placeholder="Choose a sitting" options={openSessions.map((s) => ({ value: s.id, label: `${s.name} (${s.examDate})` }))} />
                  </Field>
                  <Checkbox name="isResit" label="This is a resit" hint="Charges the resit fee where one is set." />
                  <p className="text-xs text-muted">The exam fee is invoiced separately from tuition.</p>
                </ActionForm>
              )}
            </section>
          </div>
        </>
      )}

      {!plan && billed.length === 0 && student.programId && terms.length > 0 && (
        <section className={`${card} mt-10`}>
          <h2 className="mb-2 font-display text-xl font-medium tracking-tight text-ink">Or use a shared payment term</h2>
          <p className="mb-5 text-sm text-muted">The school-wide terms, for a student on a standard schedule.</p>
          <ActionForm action={generateInvoicesAction.bind(null, student.id)} submitLabel="Generate invoices" className="flex flex-wrap items-end gap-3">
            <Field name="termId" label="Payment term">
              <Select name="termId" required placeholder="Choose a term" options={terms.map((t) => ({ value: t.id, label: `${t.name} (${t.installments.length} payment(s))` }))} />
            </Field>
          </ActionForm>
        </section>
      )}

      <Band label="Invoices" />
      <section className={sheet}>
        <table className="min-w-full divide-y divide-line">
          <thead><tr><th className={th}>Invoice</th><th className={th}>For</th><th className={th}>Due</th><th className={th}>Amount</th><th className={th}>Paid</th><th className={th}>Status</th></tr></thead>
          <tbody className="divide-y divide-line">
            {invoices.map((i) => (
              <tr key={i.id}>
                <td className={td}><Link className="text-gold transition-colors hover:text-gold-soft" href={`/invoices/${i.id}`}>{i.invoiceNumber}</Link></td>
                <td className={td}>{i.kind === "exam" ? "Exam fee" : i.installmentNo ? `Month ${i.installmentNo}` : "Tuition"}</td>
                <td className={`${td} tabular-nums`}>{i.dueDate}</td>
                <td className={`${td} tabular-nums`}>{mmk(i.amount)}</td>
                <td className={`${td} tabular-nums`}>{mmk(i.paid)}</td>
                <td className={td}><InvoiceBadge status={i.status} overdue={i.overdue} /></td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td className={td} colSpan={6}>No invoices yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gold" }) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-muted">{label}</dt>
      <dd className={`mt-1.5 font-display text-2xl font-medium tracking-tight tabular-nums ${tone === "gold" ? "text-gold" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
