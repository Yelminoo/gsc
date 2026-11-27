import Link from "next/link";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { listPayments } from "@/server/queries";
import { mmk } from "@/lib/money";
import { PageHeader, Pager, parsePage, sheet, td, th } from "@/components/ui/page";

export default async function PaymentsPage(props: PageProps<"/payments">) {
  await requireUser();
  const page = parsePage((await props.searchParams).page);
  const data = await listPayments(getDb(), page);
  return (
    <>
      <PageHeader eyebrow="Ledger" title="Payments" />
      <div className={sheet}>
        <table className="min-w-full divide-y divide-line">
          <thead><tr><th className={th}>Date</th><th className={th}>Student</th><th className={th}>Invoice</th><th className={th}>Amount</th><th className={th}>Method</th><th className={th}>Reference</th></tr></thead>
          <tbody className="divide-y divide-line">
            {data.items.map((p) => (
              <tr key={p.id}>
                <td className={td}>{p.paidDate}</td><td className={td}>{p.studentName}</td>
                <td className={td}><Link className="text-gold transition-colors hover:text-gold-soft" href={`/invoices/${p.invoiceId}`}>{p.invoiceNumber}</Link></td>
                <td className={td}>{mmk(p.amount)}</td><td className={td}>{p.method.replace("_", " ")}</td><td className={td}>{p.reference ?? "-"}</td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td className={td} colSpan={6}>No payments recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/payments" page={page} total={data.total} pageSize={data.pageSize} />
    </>
  );
}
