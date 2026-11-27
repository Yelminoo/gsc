import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { listTerms } from "@/server/queries";
import { createTermAction } from "@/server/actions/terms";
import { ActionForm, Field, Input } from "@/components/forms/action-form";
import { PageHeader, card } from "@/components/ui/page";

export default async function TermsPage() {
  const user = await requireUser();
  const terms = await listTerms(getDb());
  return (
    <>
      <PageHeader eyebrow="Billing" title="Payment terms" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {terms.map((t) => (
            <div key={t.id} className={card}>
              <h2 className="font-display text-xl font-medium tracking-tight text-ink">{t.name}</h2>
              {Number(t.discountPercent) > 0 && <p className="text-sm text-muted">Discount: {t.discountPercent}%</p>}
              <ul className="mt-2 space-y-1 text-sm">
                {t.installments.map((i) => <li key={i.installmentNo}>Payment {i.installmentNo}: {i.percentage}% due {i.dueOffsetDays} day(s) after invoice date</li>)}
              </ul>
            </div>
          ))}
          {terms.length === 0 && <p className="text-sm text-muted">No payment terms yet.</p>}
        </div>
        {user.role === "admin" && (
          <div className={card}>
            <h2 className="mb-5 font-display text-xl font-medium tracking-tight text-ink">New payment term</h2>
            <ActionForm action={createTermAction} submitLabel="Create term" resetOnSuccess>
              <Field name="name" label="Name" required placeholder="e.g. 3 payments" />
              <Field name="discountPercent" label="Discount (%)" defaultValue="0" hint="Applied to the full tuition before splitting." />
              <p className="text-sm font-medium text-ink-2">Installments (must total 100%)</p>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="grid grid-cols-2 gap-3">
                  <Input name={`pct${n}`} inputMode="decimal" placeholder={`Payment ${n} %`} aria-label={`Payment ${n} percentage`} />
                  <Input name={`days${n}`} inputMode="numeric" placeholder="Days after invoice" aria-label={`Payment ${n} due days`} />
                </div>
              ))}
            </ActionForm>
          </div>
        )}
      </div>
    </>
  );
}
