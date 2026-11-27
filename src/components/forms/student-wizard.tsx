"use client";

import { useMemo, useState, type ReactNode } from "react";
import { createStudentAction } from "@/server/actions/students";
import { formatMMK, toPya } from "@/lib/money";
import { ActionForm, Field, SubmitButton, inputClass, useActionStatus } from "./action-form";

export type ProgramOption = { id: string; name: string; tuitionFee: string };

const STEPS = [
  { title: "Program", hint: "Choose one" },
  { title: "Student", hint: "Name and contact" },
  { title: "Guardian", hint: "Optional" },
  { title: "Review", hint: "Check and register" },
] as const;

/** Which step each field belongs to, so a server error can send the user back to it. */
const FIELD_STEP: Record<string, number> = {
  programId: 0,
  fullName: 1, email: 1, phone: 1, dateOfBirth: 1,
  guardianName: 2, guardianRelationship: 2, guardianPhone: 2,
};

export function StudentWizard({ programs }: { programs: ProgramOption[] }) {
  return (
    <ActionForm action={createStudentAction} submitLabel="Register student" className="space-y-5" hideSubmit>
      <Wizard programs={programs} />
    </ActionForm>
  );
}

/**
 * Design option B's stepped form: a step list on the left, the fields in the middle and a
 * running summary on the right.
 *
 * Every step stays mounted so one submit carries the whole form; inactive steps are hidden
 * and drop their `required`, which would otherwise block submission from another step.
 */
function Wizard({ programs }: { programs: ProgramOption[] }) {
  const status = useActionStatus();
  const errored = Object.keys(status.fieldErrors ?? {});
  // After a rejected submit, open the earliest step that has a problem.
  const errorStep = errored.length ? Math.min(...errored.map((f) => FIELD_STEP[f] ?? 0)) : null;
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState(status.values?.programId ?? "");
  const [name, setName] = useState(status.values?.fullName ?? "");
  const current = errorStep ?? step;
  const last = STEPS.length - 1;

  const program = useMemo(() => programs.find((p) => p.id === picked), [programs, picked]);
  const fee = program ? toPya(program.tuitionFee) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)_240px] lg:gap-8">
      {/* Steps */}
      <ol className="flex gap-3 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
        {STEPS.map((s, i) => {
          const state = i === current ? "current" : i < current ? "done" : "todo";
          return (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={state === "current" ? "step" : undefined}
                className={`flex w-full items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-left transition-colors ${
                  state === "current" ? "bg-tint/[0.06] text-ink" : "text-muted hover:bg-tint/[0.03] hover:text-ink-2"
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] tabular-nums ${
                    state === "current" ? "border-gold bg-gold text-on-gold"
                    : state === "done" ? "border-gold/40 text-gold" : "border-line-strong text-muted"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm">{s.title}</span>
                  <span className="hidden text-[11px] text-muted lg:block">{s.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Fields */}
      <div className="min-w-0">
        <Step active={current === 0} title="Which program?" hint="Tuition is shown in kyat. You can also decide later.">
          <div className="grid gap-3 sm:grid-cols-2">
            {programs.map((p) => (
              <label
                key={p.id}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  picked === p.id ? "border-gold bg-gold/[0.07]" : "border-line hover:border-line-strong"
                }`}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="programId"
                    value={p.id}
                    checked={picked === p.id}
                    onChange={() => setPicked(p.id)}
                    className="mt-1 h-4 w-4 accent-[var(--gold)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{p.name}</span>
                    <span className="mt-1 block text-sm tabular-nums text-gold">{formatMMK(toPya(p.tuitionFee))}</span>
                  </span>
                </span>
              </label>
            ))}
            <label
              className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                picked === "" ? "border-gold bg-gold/[0.07]" : "border-line hover:border-line-strong"
              }`}
            >
              <span className="flex items-start gap-3">
                <input type="radio" name="programId" value="" checked={picked === ""} onChange={() => setPicked("")} className="mt-1 h-4 w-4 accent-[var(--gold)]" />
                <span>
                  <span className="block text-sm font-medium text-ink">Decide later</span>
                  <span className="mt-1 block text-xs text-muted">Register now, assign a program afterwards</span>
                </span>
              </span>
            </label>
          </div>
        </Step>

        <Step active={current === 1} title="Student details" hint="Only the full name is required.">
          <div className="space-y-4">
            <Field name="fullName" label="Full name" required={current === 1}>
              <input
                id="f-fullName"
                name="fullName"
                required={current === 1}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="email" label="Email" type="email" />
              <Field name="phone" label="Phone" type="tel" />
              <Field name="dateOfBirth" label="Date of birth" type="date" />
            </div>
          </div>
        </Step>

        <Step active={current === 2} title="Parent or guardian" hint="Leave blank if the student is paying for themselves.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="guardianName" label="Name" />
            <Field name="guardianRelationship" label="Relationship" />
            <Field name="guardianPhone" label="Phone" type="tel" />
          </div>
        </Step>

        <Step active={current === 3} title="Review" hint="A student code is issued automatically on registering.">
          <dl className="divide-y divide-line border-y border-line text-sm">
            <Row label="Program" value={program?.name ?? "To be decided"} />
            <Row label="Tuition" value={program ? formatMMK(fee) : "—"} />
            <Row label="Invoices" value="Generated afterwards, from a payment term" />
          </dl>
          <p className="mt-4 text-xs text-muted">
            Check the earlier steps if anything is missing. Nothing is saved until you register.
          </p>
        </Step>

        <div className="mt-6 flex w-full flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setStep(Math.max(0, current - 1))}
            disabled={current === 0}
            className="rounded-lg border border-line px-4 py-2 text-sm text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-40"
          >
            Back
          </button>
          {current < last ? (
            <button
              type="button"
              onClick={() => setStep(current + 1)}
              className="rounded-lg bg-gold px-5 py-2 text-sm font-medium text-on-gold transition-colors hover:bg-gold-soft"
            >
              Continue
            </button>
          ) : (
            <SubmitButton label="Register student" />
          )}
          <span className="ml-auto text-xs tabular-nums text-muted">
            Step {current + 1} of {STEPS.length}
          </span>
        </div>
      </div>

      {/* Running summary */}
      <aside className="h-fit rounded-xl border border-line bg-surface-2/50 p-4 text-sm lg:sticky lg:top-6">
        <p className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.2em] text-muted">This registration</p>
        <dl className="space-y-2.5">
          <SummaryRow label="Name" value={name || "—"} />
          <SummaryRow label="Program" value={program?.name ?? "To be decided"} />
          <SummaryRow label="Tuition" value={program ? formatMMK(fee) : "—"} strong />
        </dl>
        <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
          Invoices are raised separately, once a payment term is chosen on the student&apos;s page.
        </p>
      </aside>
    </div>
  );
}

function Step({ active, title, hint, children }: { active: boolean; title: string; hint?: string; children: ReactNode }) {
  return (
    <section hidden={!active} aria-hidden={!active}>
      <h2 className="font-display text-2xl font-medium tracking-tight text-ink">{title}</h2>
      {hint && <p className="mb-5 mt-1 text-sm text-muted">{hint}</p>}
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`min-w-0 truncate text-right ${strong ? "font-medium tabular-nums text-gold" : "text-ink-2"}`}>{value}</dd>
    </div>
  );
}
