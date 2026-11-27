import type { ReactNode } from "react";
import Link from "next/link";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { reportSummary } from "@/server/queries";
import { formatMMK, numericToPya, mmk } from "@/lib/money";
import { daysBetween } from "@/lib/dates";
import { Figure, PageHeader, card, sheet, td, th } from "@/components/ui/page";
import { COLORS, GroupedBars, HBars, SegmentedBar } from "@/components/charts/chart";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10" into a short axis label and a full table label. */
function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  const name = MONTHS[Number(m) - 1] ?? ym;
  return { short: name, full: `${name} ${y}` };
}

/** Compact axis ticks. The exact amount stays in the tooltip and the table. */
function tick(pya: number): string {
  const kyat = pya / 100;
  if (kyat === 0) return "0";
  if (kyat >= 1_000_000) return `${+(kyat / 1_000_000).toFixed(1)}M`;
  if (kyat >= 1_000) return `${Math.round(kyat / 1_000)}k`;
  return String(Math.round(kyat));
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className={`${card} group relative overflow-hidden`}>
      <span aria-hidden className={`absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent ${tone === "warn" ? "via-bad/50" : "via-gold/40"} to-transparent`} />
      <p className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className={`mt-4 font-display text-[2rem] font-medium leading-none tracking-tight tabular-nums ${tone === "warn" ? "text-bad" : "text-ink"}`}>{value}</p>
      {hint && <p className="mt-3 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className={card}>
      <h2 className="font-display text-xl font-medium tracking-tight text-ink">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function ReportsPage() {
  await requireUser();
  const r = await reportSummary(getDb());

  const invoiced = numericToPya(r.totals.invoiced);
  const collected = numericToPya(r.totals.collected);
  const outstanding = numericToPya(r.totals.outstanding);
  const overdue = numericToPya(r.totals.overdue);
  const rate = invoiced > 0 ? Math.round((collected / invoiced) * 1000) / 10 : 0;

  const labels = r.monthly.map((m) => monthLabel(m.month));
  const ageingRows = [
    { label: "Not yet due", value: numericToPya(r.ageing.current), color: COLORS.ordinal[0] },
    { label: "1 to 30 days late", value: numericToPya(r.ageing.d1), color: COLORS.ordinal[1] },
    { label: "31 to 60 days late", value: numericToPya(r.ageing.d31), color: COLORS.ordinal[2] },
    { label: "Over 60 days late", value: numericToPya(r.ageing.d61), color: COLORS.ordinal[3] },
  ];
  const statusSegments = [
    { label: "Paid", value: r.statusCounts.paid, color: COLORS.ordinal[3], textColor: COLORS.onOrdinal[3] },
    { label: "Part paid", value: r.statusCounts.partial, color: COLORS.ordinal[2], textColor: COLORS.onOrdinal[2] },
    { label: "Not yet due", value: r.statusCounts.unpaid, color: COLORS.ordinal[1], textColor: COLORS.onOrdinal[1] },
    { label: "Overdue", value: r.statusCounts.overdue, color: COLORS.alert, textColor: COLORS.onAlert },
  ];
  const methodRows = r.byMethod.map((m) => ({
    label: `${m.method.replace("_", " ")} (${m.count})`,
    value: numericToPya(m.collected),
  }));

  return (
    <>
      <PageHeader eyebrow="Finance" title="Reports and balance sheet" />
      <p className="-mt-6 mb-8 text-sm text-muted">As of {r.asOf}. Void invoices are excluded throughout.</p>

      {/* Ledger: one oversized figure carries the page. */}
      <section className="border-y border-line py-8">
        <p className="mb-4 text-[10.5px] font-medium uppercase tracking-[0.28em] text-muted">Collection rate</p>
        <Figure
          value={String(rate)}
          suffix="%"
          caption={
            <>
              {formatMMK(collected)} collected against {formatMMK(invoiced)} billed.{" "}
              {r.statusCounts.overdue > 0
                ? `${r.statusCounts.overdue} invoice${r.statusCounts.overdue === 1 ? " is" : "s are"} past due.`
                : "Nothing is past due."}
            </>
          }
        />
      </section>

      {/* Showcase: the rest of the summary as tiles, one idea each. */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Invoiced" value={formatMMK(invoiced)} hint={`${r.totals.invoiceCount} invoice(s)`} />
        <Stat label="Collected" value={formatMMK(collected)} hint={`${r.totals.paidCount} fully paid`} />
        <Stat label="Outstanding" value={formatMMK(outstanding)} hint="Still receivable" />
        <Stat label="Overdue" value={formatMMK(overdue)} hint="Past the due date" tone={overdue > 0 ? "warn" : undefined} />
        <Stat label="Students" value={`${r.counts.active} active`} hint={`${r.counts.students} on the register`} />
      </div>

      <div className="mt-6 space-y-6">
        <Panel title="Invoiced and collected by month" subtitle="Last 12 months, both in Myanmar kyat on one scale.">
          <GroupedBars
            labels={labels}
            series={[
              { name: "Invoiced", color: COLORS.series1, values: r.monthly.map((m) => numericToPya(m.invoiced)) },
              { name: "Collected", color: COLORS.series2, values: r.monthly.map((m) => numericToPya(m.collected)) },
            ]}
            format={formatMMK}
            formatTick={tick}
            caption="Invoiced and collected by month"
            emptyText="No invoices or payments in the last 12 months."
          />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Receivables by age" subtitle="Where the unpaid money sits.">
            <HBars rows={ageingRows} format={formatMMK} caption="Age band" unitLabel="Outstanding" emptyText="Nothing outstanding." />
          </Panel>

          <Panel title="Collected by payment method" subtitle="Number of payments in brackets.">
            <HBars rows={methodRows} format={formatMMK} caption="Method" unitLabel="Collected" emptyText="No payments recorded yet." />
          </Panel>
        </div>

        <Panel title="Invoices by state" subtitle="Share of all invoices that are not void.">
          <SegmentedBar
            segments={statusSegments}
            format={(n) => `${n} invoice${n === 1 ? "" : "s"}`}
            caption="State"
            emptyText="No invoices yet."
          />
        </Panel>
      </div>

      <section className={`${card} mt-6`}>
        <h2 className="mb-5 font-display text-xl font-medium tracking-tight text-ink">Balance sheet summary</h2>
        <table className="min-w-full text-sm">
          <tbody>
            <tr><td className={td}>Assets: cash received</td><td className={`${td} text-right tabular-nums`}>{mmk(r.totals.collected)}</td></tr>
            <tr><td className={td}>Assets: accounts receivable (not yet due plus overdue)</td><td className={`${td} text-right tabular-nums`}>{mmk(r.totals.outstanding)}</td></tr>
            <tr className="border-t border-line font-semibold"><td className={td}>Total revenue billed</td><td className={`${td} text-right tabular-nums`}>{mmk(r.totals.invoiced)}</td></tr>
          </tbody>
        </table>
      </section>

      <section className={`${sheet} mt-10`}>
        <h2 className="px-5 pt-5 font-display text-xl font-medium tracking-tight text-ink">Overdue invoices</h2>
        <table className="mt-2 min-w-full divide-y divide-line">
          <thead><tr><th className={th}>Invoice</th><th className={th}>Student</th><th className={th}>Due</th><th className={th}>Days late</th><th className={th}>Outstanding</th></tr></thead>
          <tbody className="divide-y divide-line">
            {r.overdueList.map((o) => (
              <tr key={o.invoiceId}>
                <td className={td}><Link className="text-gold transition-colors hover:text-gold-soft" href={`/invoices/${o.invoiceId}`}>{o.invoiceNumber}</Link></td>
                <td className={td}>{o.studentName}</td><td className={td}>{o.dueDate}</td>
                <td className={td}>{daysBetween(o.dueDate, r.asOf)}</td>
                <td className={`${td} tabular-nums`}>{mmk(o.outstanding)}</td>
              </tr>
            ))}
            {r.overdueList.length === 0 && <tr><td className={td} colSpan={5}>Nothing overdue.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
