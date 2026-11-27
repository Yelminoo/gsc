import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { getInvoice } from "@/server/queries";
import { recordPaymentAction, voidInvoiceAction } from "@/server/actions/invoices";
import { ActionForm, Field, Select } from "@/components/forms/action-form";
import { InvoiceBadge, PageHeader, card, sheet, td, tdWrap, th } from "@/components/ui/page";
import { numericToPya, mmk, toNumeric } from "@/lib/money";
import { today } from "@/lib/dates";
import { idSchema } from "@/lib/validators";

export default async function InvoicePage(props: PageProps<"/invoices/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();
  const data = await getInvoice(getDb(), id);
  if (!data) notFound();
  const { invoice, items, payments } = data;
  const outstanding = numericToPya(invoice.amount) - numericToPya(invoice.paid);

  return (
    <>
      <PageHeader eyebrow="Billing"
        title={`Invoice ${invoice.invoiceNumber}`}
        actions={<a className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-tint/[0.02] px-4 py-2.5 text-sm text-ink-2 transition-colors hover:border-gold/40 hover:text-ink" href={`/invoices/${invoice.id}/pdf`}>Download PDF</a>}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <p className="mb-2"><InvoiceBadge status={invoice.status} overdue={invoice.overdue} /></p>
          <p className="text-sm">Student: <Link className="text-gold transition-colors hover:text-gold-soft" href={`/students/${invoice.studentId}`}>{invoice.studentName}</Link> ({invoice.studentCode})</p>
          <p className="text-sm">Issued: {invoice.issueDate} | Due: {invoice.dueDate}</p>
          {/* The description can be long, so it wraps and the row keeps its price inside the card. */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className={`${th} px-0`}>Item</th><th className={`${th} px-3`}>Qty</th><th className={`${th} px-0 text-right`}>Price</th></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className={`${tdWrap} px-0`}>{it.description}</td>
                    <td className={`${td} px-3 tabular-nums`}>{it.quantity}</td>
                    <td className={`${td} px-0 text-right tabular-nums`}>{mmk(it.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt>Total</dt><dd>{mmk(invoice.amount)}</dd></div>
            <div className="flex justify-between"><dt>Paid</dt><dd>{mmk(invoice.paid)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Outstanding</dt><dd>{mmk(toNumeric(outstanding))}</dd></div>
          </dl>
        </section>

        <section className={card}>
          <h2 className="mb-5 font-display text-xl font-medium tracking-tight text-ink">Record payment</h2>
          {invoice.status !== "void" && outstanding > 0 ? (
            <ActionForm action={recordPaymentAction.bind(null, invoice.id)} submitLabel="Record payment" resetOnSuccess>
              <Field name="amount" label="Amount (MMK)" required defaultValue={toNumeric(outstanding)} hint="Cannot exceed the outstanding balance." />
              <Field name="method" label="Method">
                <Select name="method" defaultValue="bank_transfer" options={[
                  { value: "bank_transfer", label: "Bank transfer" }, { value: "cash", label: "Cash" },
                  { value: "card", label: "Card" }, { value: "cheque", label: "Cheque" },
                ]} />
              </Field>
              <Field name="paidDate" label="Payment date" type="date" defaultValue={today()} />
              <Field name="reference" label="Reference / slip no." />
            </ActionForm>
          ) : <p className="text-sm text-muted">{invoice.status === "void" ? "This invoice is void." : "This invoice is fully paid."}</p>}

          {user.role === "admin" && invoice.status !== "void" && payments.length === 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <ActionForm action={voidInvoiceAction.bind(null, invoice.id)} submitLabel="Void invoice" danger />
            </div>
          )}
        </section>
      </div>

      <section className={`${sheet} mt-10`}>
        <table className="min-w-full divide-y divide-line">
          <thead><tr><th className={th}>Date</th><th className={th}>Amount</th><th className={th}>Method</th><th className={th}>Reference</th></tr></thead>
          <tbody className="divide-y divide-line">
            {payments.map((p) => <tr key={p.id}><td className={td}>{p.paidDate}</td><td className={td}>{mmk(p.amount)}</td><td className={td}>{p.method.replace("_", " ")}</td><td className={td}>{p.reference ?? "-"}</td></tr>)}
            {payments.length === 0 && <tr><td className={td} colSpan={4}>No payments yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
