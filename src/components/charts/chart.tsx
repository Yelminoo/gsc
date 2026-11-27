import type { ReactNode } from "react";

/**
 * Small chart kit rendered as inline SVG on the server.
 *
 * No charting library and no client JavaScript: that keeps the strict
 * Content-Security-Policy intact and adds no dependency to patch.
 * Hover text uses the SVG <title> element, and every chart ships a data table
 * so the numbers are readable without relying on colour.
 *
 * Palette: validated categorical slots 1 and 2 plus a single-hue ordinal ramp.
 */
// Theme-aware: each value is a CSS variable from globals.css with a light and a dark value.
// Marks therefore set colours through `style`, which resolves var(); SVG attributes do not.
export const COLORS = {
  series1: "var(--series-1)", // champagne gold
  series2: "var(--series-2)", // steel blue
  // One hue, least to most emphasis for the active theme.
  ordinal: ["var(--ord-0)", "var(--ord-1)", "var(--ord-2)", "var(--ord-3)"],
  onOrdinal: ["var(--on-ord-0)", "var(--on-ord-1)", "var(--on-ord-2)", "var(--on-ord-3)"],
  alert: "var(--alert)",
  onAlert: "var(--on-alert)",
} as const;

const NICE = [1, 2, 2.5, 5, 10];
/** Round an axis maximum up to a readable step. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  for (const n of NICE) if (value <= n * base) return n * base;
  return 10 * base;
}

/** Bar with only the data end rounded, so the mark stays anchored to its baseline. */
function barUp(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}
export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: i.color }} />
          {i.name}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-5 border-t border-line pt-3 text-sm">
      <summary className="cursor-pointer select-none text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-gold">+ Show the numbers</summary>
      <table className="mt-2 min-w-full text-sm">
        <thead>
          <tr>{head.map((h, i) => <th key={h} className={`px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={String(r[0])}>{r.map((c, i) => <td key={i} className={`px-2 py-1 text-ink-2 ${i ? "text-right tabular-nums" : ""}`}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}

export type Series = { name: string; color: string; values: number[] };

/** Grouped vertical bars. Both series must share one unit, because there is only ever one axis. */
export function GroupedBars({
  labels, series, format, formatTick, caption, emptyText = "Nothing to show yet.",
}: {
  /** `short` labels the axis, `full` labels the data table. */
  labels: { short: string; full: string }[]; series: Series[];
  format: (n: number) => string; formatTick: (n: number) => string;
  caption: string; emptyText?: string;
}) {
  const all = series.flatMap((s) => s.values);
  if (!labels.length || all.every((v) => v === 0)) return <Empty>{emptyText}</Empty>;

  const W = 760, H = 280, L = 62, R = 8, T = 14, B = 34;
  const pw = W - L - R, ph = H - T - B;
  const max = niceMax(Math.max(...all));
  const y = (v: number) => T + ph - (v / max) * ph;
  const group = pw / labels.length;
  const inner = group * 0.68;
  const gap = 2;
  const bw = Math.max(2, (inner - gap * (series.length - 1)) / series.length);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  return (
    <>
      <Legend items={series.map((s) => ({ name: s.name, color: s.color }))} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={caption} style={{ height: "auto" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} className="fill-muted">{formatTick(t)}</text>
          </g>
        ))}
        {labels.map((label, i) => {
          const gx = L + i * group + (group - inner) / 2;
          return (
            <g key={label.full}>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const h = Math.max(0, T + ph - y(v));
                return (
                  <path key={s.name} d={barUp(gx + si * (bw + gap), y(v), bw, h)} style={{ fill: s.color }} className="transition-opacity hover:opacity-75">
                    <title>{`${label.full} · ${s.name}: ${format(v)}`}</title>
                  </path>
                );
              })}
              {/* Every other month once the axis gets crowded, but always the first and the latest. */}
              {(labels.length <= 7 || i % 2 === 0 || i === labels.length - 1) && (
                <text x={gx + inner / 2} y={H - 12} textAnchor="middle" fontSize={11} className="fill-muted">{label.short}</text>
              )}
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={T + ph} y2={T + ph} className="stroke-line" strokeWidth={1} />
      </svg>
      <DataTable
        head={["Month", ...series.map((s) => s.name)]}
        rows={labels.map((l, i) => [l.full, ...series.map((s) => format(s.values[i] ?? 0))])}
      />
    </>
  );
}

/**
 * Ranked horizontal bars, built from HTML rather than SVG so the text stays at
 * its real size in a narrow column instead of being scaled down with a viewBox.
 */
export function HBars({
  rows, format, caption, color = COLORS.series1, emptyText = "Nothing to show yet.", unitLabel = "Amount",
}: {
  rows: { label: string; value: number; color?: string }[];
  format: (n: number) => string; caption: string; color?: string; emptyText?: string; unitLabel?: string;
}) {
  if (!rows.length || rows.every((r) => r.value === 0)) return <Empty>{emptyText}</Empty>;
  const max = niceMax(Math.max(...rows.map((r) => r.value)));

  return (
    <>
      <ul className="space-y-2.5" aria-label={caption}>
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(6rem,8rem)_1fr] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(7rem,9rem)_1fr_auto]">
            <span className="truncate text-ink-2" title={r.label}>{r.label}</span>
            <span className="h-1.5 w-full rounded-full bg-tint/5" title={`${r.label}: ${format(r.value)}`}>
              <span
                className="block h-1.5 rounded-full transition-opacity hover:opacity-75"
                style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: r.color ?? color }}
              />
            </span>
            <span className="col-start-2 tabular-nums text-ink-2 sm:col-start-3 sm:text-right">{format(r.value)}</span>
          </li>
        ))}
      </ul>
      <DataTable head={[caption, unitLabel]} rows={rows.map((r) => [r.label, format(r.value)])} />
    </>
  );
}

/** One tall segmented bar: part-to-whole at a glance, up to six segments. */
export function SegmentedBar({
  segments, format, caption, emptyText = "Nothing to show yet.",
}: {
  segments: { label: string; value: number; color: string; textColor?: string }[];
  format: (n: number) => string; caption: string; emptyText?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  if (!total) return <Empty>{emptyText}</Empty>;

  const parts = shown.map((s) => ({ ...s, pct: (s.value / total) * 100 }));

  return (
    <>
      <Legend items={shown.map((s) => ({ name: s.label, color: s.color }))} />
      {/* HTML rather than SVG, so the in-segment labels keep their real size. The 2px gap is the separator. */}
      <div className="flex gap-0.5" role="img" aria-label={caption}>
        {parts.map((p) => (
          <div
            key={p.label}
            className="min-w-0 rounded-md px-3 py-3 transition-opacity first:rounded-l-lg last:rounded-r-lg hover:opacity-90"
            style={{ width: `${p.pct}%`, background: p.color, color: p.textColor ?? "var(--ink)" }}
            title={`${p.label}: ${format(p.value)} (${p.pct.toFixed(0)}%)`}
          >
            {/* Only label inside a segment that is wide enough to hold it. */}
            {p.pct >= 14 && (
              <>
                <p className="truncate text-xs">{p.label}</p>
                <p className="truncate text-sm font-semibold tabular-nums">{format(p.value)}</p>
              </>
            )}
          </div>
        ))}
      </div>
      <DataTable head={[caption, "Value", "Share"]} rows={parts.map((p) => [p.label, format(p.value), `${p.pct.toFixed(0)}%`])} />
    </>
  );
}
