import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { listPrograms } from "@/server/queries";
import { createProgramAction } from "@/server/actions/students";
import { ActionForm, Checkbox, Field } from "@/components/forms/action-form";
import { PageHeader, card, sheet, td, th } from "@/components/ui/page";
import { mmk } from "@/lib/money";

export default async function ProgramsPage() {
  const user = await requireUser();
  const programs = await listPrograms(getDb());
  return (
    <>
      <PageHeader eyebrow="Curriculum" title="Programs and tuition" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={sheet}>
          <table className="min-w-full divide-y divide-line">
            <thead><tr><th className={th}>Program</th><th className={th}>Tuition</th><th className={th}>Exam</th></tr></thead>
            <tbody className="divide-y divide-line">
              {programs.map((p) => (
                <tr key={p.id}>
                  <td className={td}>{p.name}</td>
                  <td className={`${td} tabular-nums`}>{mmk(p.tuitionFee)}</td>
                  <td className={td}>
                    {p.hasExam
                      ? <span className="text-ink-2">{p.examBoard ?? "Yes"}</span>
                      : <span className="text-muted">No exam</span>}
                  </td>
                </tr>
              ))}
              {programs.length === 0 && <tr><td className={td} colSpan={3}>No programs yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {user.role === "admin" && (
          <div className={card}>
            <h2 className="mb-5 font-display text-xl font-medium tracking-tight text-ink">Add program</h2>
            <ActionForm action={createProgramAction} submitLabel="Add program" resetOnSuccess>
              <Field name="name" label="Program name" required />
              <Field name="tuitionFee" label="Tuition fee (MMK)" required placeholder="4800000" />
              <Checkbox
                name="hasExam" label="This program ends in an exam"
                hint="The exam fee is charged on top of tuition, as its own invoice, and set per sitting on the Exams page."
              />
              <Field name="examBoard" label="Exam board" placeholder="Gem-A" />
            </ActionForm>
          </div>
        )}
      </div>
    </>
  );
}
