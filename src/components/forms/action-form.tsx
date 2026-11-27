"use client";

import type React from "react";
import { createContext, useActionState, useContext, type ReactNode } from "react";
import type { ActionState } from "@/server/actions/types";

const Ctx = createContext<ActionState>({});
const PendingCtx = createContext(false);

export const inputClass =
  "w-full rounded-lg border border-line-strong bg-tint/[0.025] px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 transition-[border-color,box-shadow,background-color] hover:border-tint/20 focus:border-gold/60 focus:bg-tint/[0.04] focus:outline-none focus:ring-4 focus:ring-gold/10 aria-[invalid=true]:border-bad/60";
export const buttonClass =
  "inline-flex items-center justify-center rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-on-gold shadow-[0_8px_24px_-10px_color-mix(in_oklab,var(--gold)_55%,transparent)] transition-colors hover:bg-gold-soft disabled:cursor-wait disabled:opacity-60";
/** For a submit that repeats on every row of a table, where a gold button would shout. */
export const quietButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-60";
const dangerButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-bad/40 bg-bad/[0.08] px-5 py-2.5 text-sm font-medium text-bad transition-colors hover:bg-bad/15 disabled:opacity-60";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function ActionForm({
  action, submitLabel, children, className = "space-y-4", resetOnSuccess = false, danger = false, quiet = false, hideSubmit = false,
}: {
  action: Action; submitLabel: string; children?: ReactNode; className?: string; resetOnSuccess?: boolean;
  danger?: boolean;
  /** Render the submit as a small outlined control rather than the gold primary button. */
  quiet?: boolean;
  /** Render no submit button, because the form supplies its own with <SubmitButton>. */
  hideSubmit?: boolean;
}) {
  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await action(prev, fd);
    if (!res.error) return res;
    const values: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (typeof v === "string" && !/password/i.test(k)) values[k] = v;
    return { ...res, values };
  }, {});
  return (
    <Ctx.Provider value={state}>
     <PendingCtx.Provider value={pending}>
      <form action={formAction} className={className} key={resetOnSuccess && state.success ? state.success : "form"}>
        {state.error && (
          <p role="alert" className="rounded-lg border border-bad/25 bg-bad/[0.08] px-3.5 py-2.5 text-sm text-bad">{state.error}</p>
        )}
        {state.success && (
          <p role="status" className="rounded-lg border border-ok/25 bg-ok/[0.08] px-3.5 py-2.5 text-sm text-ok">{state.success}</p>
        )}
        {children}
        {!hideSubmit && (
          <button type="submit" disabled={pending} className={danger ? dangerButtonClass : quiet ? quietButtonClass : buttonClass}>
            {pending ? "Please wait..." : submitLabel}
          </button>
        )}
      </form>
     </PendingCtx.Provider>
    </Ctx.Provider>
  );
}

/** True while the form is submitting, for a form that renders its own submit button. */
export function useFormPending(): boolean {
  return useContext(PendingCtx);
}

/** A submit button for a form started with hideSubmit. */
export function SubmitButton({ label, className = "" }: { label: string; className?: string }) {
  const pending = useFormPending();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass} ${className}`}>
      {pending ? "Please wait..." : label}
    </button>
  );
}

/** The current action result: field errors, the error banner, and kept values. */
export function useActionStatus(): ActionState {
  return useContext(Ctx);
}

const useValue = (name: string, fallback?: string) => useContext(Ctx).values?.[name] ?? fallback;

/** Plain input that keeps its value after a failed submit. */
export function Input({ name, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { name: string }) {
  const value = useValue(name, typeof rest.defaultValue === "string" ? rest.defaultValue : undefined);
  return <input key={value ?? ""} name={name} className={inputClass} {...rest} defaultValue={value} />;
}

export function Select({ name, options, placeholder, required, defaultValue }: {
  name: string; options: { value: string; label: string }[]; placeholder?: string; required?: boolean; defaultValue?: string;
}) {
  const value = useValue(name, defaultValue) ?? "";
  return (
    <select key={value} id={`f-${name}`} name={name} required={required} className={inputClass} defaultValue={value}>
      {placeholder !== undefined && <option value="" disabled={required}>{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** A checkbox with its label beside it, since Field's stacked label reads oddly for one. */
export function Checkbox({ name, label, hint, defaultChecked }: {
  name: string; label: string; hint?: string; defaultChecked?: boolean;
}) {
  const kept = useValue(name);
  const checked = kept === undefined ? defaultChecked : kept === "on";
  return (
    <div>
      <label className="flex items-start gap-2.5 text-sm text-ink">
        <input
          key={String(checked)} type="checkbox" name={name} defaultChecked={checked}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--gold)]"
        />
        <span>{label}</span>
      </label>
      {hint && <p className="ml-6.5 mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Field({
  name, label, type = "text", required, placeholder, defaultValue, autoComplete, children, hint,
}: {
  name: string; label: string; type?: string; required?: boolean; placeholder?: string; defaultValue?: string;
  autoComplete?: string; children?: ReactNode; hint?: string;
}) {
  const errors = useContext(Ctx).fieldErrors?.[name];
  const kept = useValue(name, defaultValue);
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        {label}{required && <span className="text-gold"> *</span>}
      </label>
      {children ?? (
        <input
          key={kept ?? ""} id={id} name={name} type={type} required={required} placeholder={placeholder}
          defaultValue={kept} autoComplete={autoComplete} className={inputClass}
          aria-invalid={errors ? true : undefined}
        />
      )}
      {hint && !errors && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
      {errors && <p className="mt-1.5 text-xs text-bad">{errors.join(" ")}</p>}
    </div>
  );
}
