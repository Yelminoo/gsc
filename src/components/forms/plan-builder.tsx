"use client";

import { useCallback, useMemo, useState } from "react";
import { createPlanAction } from "@/server/actions/plans";
import { addMonths, today } from "@/lib/dates";
import { formatMMK, splitEvenly, toPya } from "@/lib/money";
import { ActionForm, Field, SubmitButton, inputClass } from "./action-form";

/**
 * The installment plan builder.
 *
 * Pick the number of months and a start date and the schedule appears at once, evenly split.
 * Switch to manual and the same rows become editable, so an irregular plan (a larger first
 * payment, a month skipped over the new year) is typed over the even split rather than built
 * from nothing. The preview is exactly what the server will bill: it uses the same even-split
 * function, so what the admin approves is what the student gets.
 */
export function PlanBuilder({ studentId, suggestedTotal }: { studentId: string; suggestedTotal?: string }) {
  const [months, setMonths] = useState(6);
  const [start, setStart] = useState(() => addMonths(today(), 1));
  const [total, setTotal] = useState(suggestedTotal ?? "");
  const [manual, setManual] = useState(false);
  const [edits, setEdits] = useState<Record<number, string>>({});

  const evenRows = useMemo(() => {
    let pya = 0;
    try { pya = total.trim() ? toPya(total) : 0; } catch { pya = 0; }
    if (pya <= 0 || months < 1) return [];
    return splitEvenly(pya, months).map((amountPya, i) => ({ amountPya, dueDate: addMonths(start, i) }));
  }, [total, months, start]);

  // What a manual row shows: the admin's own figure, else the even split it started from.
  const manualAmount = useCallback(
    (i: number) => edits[i] ?? (evenRows[i] ? String(Math.round(evenRows[i].amountPya / 100)) : ""),
    [edits, evenRows],
  );

  const manualTotal = useMemo(() => {
    if (!manual) return null;
    let sum = 0;
    for (let i = 0; i < months; i++) {
      const v = manualAmount(i).trim();
      try { sum += v ? toPya(v) : 0; } catch { return null; }
    }
    return sum;
  }, [manual, months, manualAmount]);

  return (
    <ActionForm action={createPlanAction.bind(null, studentId)} submitLabel="Create plan" hideSubmit className="space-y-5">
      <input type="hidden" name="mode" value={manual ? "manual" : "even"} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="months" label="Months" required>
          <input
            id="f-months" name="months" type="number" min={1} max={60} required value={months}
            onChange={(e) => { setMonths(Math.max(1, Math.min(60, Number(e.target.value) || 1))); setEdits({}); }}
            className={inputClass}
          />
        </Field>
        <Field name="startDate" label="First payment due" required>
          <input
            id="f-startDate" name="startDate" type="date" required value={start}
            onChange={(e) => { setStart(e.target.value); setEdits({}); }}
            className={inputClass}
          />
        </Field>
        <Field name="total" label="Total (MMK)" required={!manual} hint={manual ? "Ignored in manual mode" : undefined}>
          <input
            id="f-total" name="total" inputMode="decimal" required={!manual} value={total} placeholder="4800000"
            onChange={(e) => { setTotal(e.target.value); setEdits({}); }}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([["even", "Divide evenly"], ["manual", "Set each month"]] as const).map(([value, label]) => {
          const active = (value === "manual") === manual;
          return (
            <button
              key={value} type="button" onClick={() => setManual(value === "manual")}
              aria-pressed={active}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                active ? "border-gold bg-gold/10 text-gold" : "border-line text-muted hover:border-line-strong hover:text-ink-2"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {evenRows.length > 0 ? (
        <div className="overflow-x-auto border-y border-line">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-0 py-2 text-left text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted">Month</th>
                <th className="px-3 py-2 text-left text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted">Due</th>
                <th className="px-0 py-2 text-right text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {Array.from({ length: months }, (_, i) => (
                <tr key={i}>
                  <td className="px-0 py-2 tabular-nums text-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    {manual ? (
                      <input
                        name={`due-${i}`} type="date" required defaultValue={evenRows[i]?.dueDate ?? addMonths(start, i)}
                        className={`${inputClass} py-1.5`}
                      />
                    ) : (
                      <span className="tabular-nums text-ink-2">{evenRows[i]?.dueDate ?? addMonths(start, i)}</span>
                    )}
                  </td>
                  <td className="px-0 py-2 text-right">
                    {manual ? (
                      <input
                        name={`amount-${i}`} inputMode="decimal" required value={manualAmount(i)}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [i]: e.target.value }))}
                        className={`${inputClass} py-1.5 text-right tabular-nums`}
                      />
                    ) : (
                      <span className="tabular-nums text-ink">{formatMMK(evenRows[i]?.amountPya ?? 0)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong">
                <td className="px-0 py-2.5 text-xs uppercase tracking-[0.16em] text-muted" colSpan={2}>Total</td>
                <td className="px-0 py-2.5 text-right font-medium tabular-nums text-gold">
                  {manual
                    ? (manualTotal === null ? "Check the amounts" : formatMMK(manualTotal))
                    : formatMMK(evenRows.reduce((s, r) => s + r.amountPya, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="border-y border-line py-4 text-sm text-muted">
          Enter a total to see the schedule.
        </p>
      )}

      <Field name="note" label="Note" hint="Optional, shown on the plan only." />
      <SubmitButton label="Create plan and raise invoices" />
    </ActionForm>
  );
}
