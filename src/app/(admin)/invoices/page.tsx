import Link from "next/link";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { listInvoiceBalances, PAGE_SIZE } from "@/server/queries";
import { mmk } from "@/lib/money";
import { InvoiceBadge, PageHeader, Pager, parsePage, sheet, td, th } from "@/components/ui/page";

const FILTERS = ["all", "open", "overdue", "paid", "void"] as const;

export default async function InvoicesPage(props: PageProps<"/invoices">) {
  await requireUser();
  const sp = await props.searchParams;
  const filter = FILTERS.find((f) => f === sp.filter) ?? "all";
  const page = parsePage(sp.page);
  const items = await listInvoiceBalances(getDb(), { filter, page });

  return (
    <>
      <PageHeader eyebrow="Billing" title="Invoices" />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link key={f} href={`/invoices?filter=${f}`} className={`rounded-full border px-3 py-1 ${f === filter ? "border-gold/40 bg-gold/10 text-gold-soft" : "border-line text-muted hover:border-line-strong hover:text-ink-2"}`}>
            {f[0].toUpperCase() + f.slice(1)}
          </Link>
        ))}
      </div>
      <div className={sheet}>
        <table className="min-w-full divide-y divide-line">
          <thead><tr><th className={th}>Invoice</th><th className={th}>Student</th><th className={th}>Due</th><th className={th}>Amount</th><th className={th}>Paid</th><th className={th}>Status</th></tr></thead>
          <tbody className="divide-y divide-line">
            {items.map((i) => (
              <tr key={i.id}>
                <td className={td}><Link className="text-gold transition-colors hover:text-gold-soft" href={`/invoices/${i.id}`}>{i.invoiceNumber}</Link></td>
                <td className={td}>{i.studentName}</td><td className={td}>{i.dueDate}</td>
                <td className={td}>{mmk(i.amount)}</td><td className={td}>{mmk(i.paid)}</td>
                <td className={td}><InvoiceBadge status={i.status} overdue={i.overdue} /></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td className={td} colSpan={6}>No invoices.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/invoices" page={page} total={items.total} pageSize={PAGE_SIZE} params={{ filter: filter === "all" ? undefined : filter }} />
    </>
  );
}
