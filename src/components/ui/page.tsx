import Link from "next/link";
import type { ReactNode } from "react";

export const card =
  "rounded-2xl border border-line bg-surface/70 p-6 shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--tint)_3%,transparent),0_20px_40px_-24px_var(--shadow)] backdrop-blur-sm";
export const th = "whitespace-nowrap px-5 py-3.5 text-left text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted";
export const td = "whitespace-nowrap px-5 py-3.5 text-sm text-ink-2";
/** Same cell, but for prose that may be long: it wraps instead of widening the table. */
export const tdWrap = "px-5 py-3.5 text-sm text-ink-2";
export const sectionTitle = "font-display text-xl font-medium tracking-tight text-ink";
export const ghostButton =
  "inline-flex items-center gap-2 rounded-lg border border-line-strong bg-tint/[0.02] px-4 py-2 text-sm text-ink-2 transition-colors hover:border-gold/40 hover:text-ink";
export const link = "text-gold transition-colors hover:text-gold-soft";

export function PageHeader({ title, actions, eyebrow }: { title: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div>
        <p className="mb-2 flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.28em] text-gold/80">
          <span aria-hidden className="h-px w-6 bg-gold/50" />
          {eyebrow ?? "Admin"}
        </p>
        <h1 className="font-display text-4xl font-medium leading-none tracking-tight text-ink sm:text-[2.75rem]">{title}</h1>
      </div>
      {actions}
    </div>
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-on-gold shadow-[0_8px_24px_-10px_color-mix(in_oklab,var(--gold)_55%,transparent)] transition-colors hover:bg-gold-soft"
    >
      {children}
    </Link>
  );
}

export function Badge({ tone, children }: { tone: "green" | "amber" | "red" | "slate" | "blue"; children: ReactNode }) {
  const tones = {
    green: "text-ok border-ok/20 bg-ok/[0.07]",
    amber: "text-warn border-warn/20 bg-warn/[0.07]",
    red: "text-bad border-bad/25 bg-bad/[0.08]",
    slate: "text-muted border-line-strong bg-tint/[0.02]",
    blue: "text-info border-info/20 bg-info/[0.07]",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${tones[tone]}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function InvoiceBadge({ status, overdue }: { status: string; overdue: boolean }) {
  if (status === "void") return <Badge tone="slate">Void</Badge>;
  if (status === "paid") return <Badge tone="green">Paid</Badge>;
  if (overdue) return <Badge tone="red">Overdue</Badge>;
  if (status === "partial") return <Badge tone="blue">Partial</Badge>;
  return <Badge tone="amber">Unpaid</Badge>;
}

export function Pager({ basePath, page, total, pageSize, params = {} }: {
  basePath: string; page: number; total: number; pageSize: number; params?: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const btn = "rounded-lg border border-line px-3.5 py-1.5 text-ink-2 transition-colors hover:border-line-strong hover:text-ink";
  return (
    <div className="mt-5 flex items-center justify-between text-xs text-muted">
      <span className="tabular-nums">
        {total} record{total === 1 ? "" : "s"} <span className="mx-1.5 text-line-strong">/</span> page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 && <Link className={btn} href={href(page - 1)}>← Previous</Link>}
        {page < pages && <Link className={btn} href={href(page + 1)}>Next →</Link>}
      </div>
    </div>
  );
}

export function parsePage(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/* ---------------------------------------------------------------------------
 * The dashboard combines two of the three design directions:
 *   Ledger   sets the page rhythm: uppercase eyebrow, large serif headline,
 *            hairline rules, tables that sit on the page rather than in a card.
 *   Showcase sets the shape of summary content: bento tiles of varied scale,
 *            one idea per tile.
 * ------------------------------------------------------------------------- */

/** Ledger: a table that sits on the page, separated by hairlines instead of card chrome. */
export const sheet = "overflow-x-auto border-t border-line";

/** Showcase: one bento tile. `span` widens it within the enclosing grid. */
export function Tile({
  title, hint, action, span = 1, tone, className = "", children,
}: {
  title?: string; hint?: string; action?: ReactNode; span?: 1 | 2 | 3; tone?: "alert";
  className?: string; children: ReactNode;
}) {
  const spans = { 1: "", 2: "sm:col-span-2", 3: "sm:col-span-2 lg:col-span-3" };
  const toneClass = tone === "alert" ? "border-bad/30 bg-bad/[0.05]" : "border-line bg-surface/70";
  return (
    <section
      className={`rounded-2xl border ${toneClass} p-5 shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--tint)_3%,transparent),0_20px_40px_-28px_var(--shadow)] backdrop-blur-sm ${spans[span]} ${className}`}
    >
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-display text-lg font-medium tracking-tight text-ink">{title}</h2>}
            {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Showcase: the compact number tile. */
export function StatTile({
  label, value, hint, tone,
}: { label: string; value: string; hint?: string; tone?: "alert" }) {
  return (
    <Tile tone={tone}>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className={`mt-2 font-display text-[1.75rem] font-medium leading-none tracking-tight ${tone === "alert" ? "text-bad" : "text-ink"}`}>
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </Tile>
  );
}

/** Ledger: the oversized serif figure that carries a page's headline number. */
export function Figure({
  value, suffix, caption,
}: { value: string; suffix?: string; caption?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
      <p className="font-display text-[clamp(3.5rem,11vw,6.5rem)] font-medium leading-[0.85] tracking-tight text-ink">
        {value}
        {suffix && <span className="ml-1 align-baseline text-[0.38em] text-gold">{suffix}</span>}
      </p>
      {caption && <div className="max-w-sm pb-2 text-sm leading-relaxed text-ink-2">{caption}</div>}
    </div>
  );
}

/** A labelled hairline divider, used between the editorial bands of a page. */
export function Band({ label }: { label: string }) {
  return (
    <div className="mb-6 mt-12 flex items-center gap-4 border-t border-line pt-4">
      <span className="text-[10.5px] font-medium uppercase tracking-[0.28em] text-muted">{label}</span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}
