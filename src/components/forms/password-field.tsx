"use client";

import { useState } from "react";
import { Field, inputClass } from "./action-form";

/** Password input with a show/hide control, as the console sign-in uses. */
export function PasswordField({ name = "password", label = "Password" }: { name?: string; label?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <Field name={name} label={label}>
      <span className="relative block">
        <input
          id={`f-${name}`}
          name={name}
          type={shown ? "text" : "password"}
          required
          autoComplete="current-password"
          className={`${inputClass} pr-16`}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          // The label says what the control does now, so it is never ambiguous.
          aria-label={shown ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted transition-colors hover:text-ink"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </span>
    </Field>
  );
}
