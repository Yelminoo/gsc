import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/dal";
import { loginAction } from "@/server/actions/auth";
import { ActionForm, Field } from "@/components/forms/action-form";
import { PasswordField } from "@/components/forms/password-field";
import { GscLockup } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * Sign in, in the console style of design option B: compact, dense and utilitarian,
 * with status strips above and below rather than a marketing panel.
 */
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/students");
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
        <GscLockup className="h-8" />
        <span className="hidden text-[10.5px] font-medium uppercase tracking-[0.24em] text-muted sm:inline">Staff console</span>
        <ThemeToggle className="ml-auto grid h-9 w-9 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-ink" />
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="stagger w-full max-w-md">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_60px_-32px_var(--shadow)]">
            {/* Console status strip */}
            <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-5 py-2.5 text-[11px] text-muted">
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn" />
                Not signed in
              </span>
              <span>Yangon office</span>
            </div>

            <div className="px-5 py-6 sm:px-7">
              <h1 className="text-lg font-semibold tracking-tight text-ink">Sign in to the console</h1>
              <p className="mt-1 text-sm text-muted">Use your staff email and password.</p>

              <div className="mt-6">
                <ActionForm action={loginAction} submitLabel="Sign in" className="space-y-4 [&>button]:w-full">
                  <Field name="email" label="Email" type="email" required autoComplete="username" placeholder="you@gsc.school" />
                  <PasswordField />
                </ActionForm>
              </div>

              {/* Two short lines rather than one row that wraps unevenly in the narrow card. */}
              <div className="mt-5 space-y-1.5 border-t border-line pt-4 text-xs text-muted">
                <p className="flex items-center gap-1.5">
                  Press
                  <kbd className="rounded border border-line-strong px-1.5 py-0.5 font-sans text-[10px] text-ink-2">Enter</kbd>
                  to sign in
                </p>
                <p>Forgot your password? Ask the school office.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-line px-4 py-3 text-center text-[11px] text-muted sm:px-6">
        Authorised staff only. Five failed attempts lock the account for 15 minutes.
      </footer>
    </main>
  );
}
