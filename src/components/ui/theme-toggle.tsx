"use client";

import { Icon } from "./icons";

const YEAR = 60 * 60 * 24 * 365;

/** Flip between light and dark. The choice is kept in a cookie so the server renders it on the next load. */
export function toggleTheme() {
  const root = document.documentElement;
  const current = root.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  document.cookie = `theme=${next}; path=/; max-age=${YEAR}; samesite=lax`;
}

/**
 * Icon and label are chosen by CSS (.show-dark / .show-light), so the button is right
 * on the first paint even when the theme comes from the operating system.
 */
export function ThemeToggle({ withLabel = false, className = "" }: { withLabel?: boolean; className?: string }) {
  return (
    <button type="button" onClick={toggleTheme} aria-label="Switch between light and dark mode" title="Switch theme" className={className}>
      <span className="show-dark items-center gap-3">
        <Icon name="sun" />
        {withLabel && <span className="whitespace-nowrap">Light mode</span>}
      </span>
      <span className="show-light items-center gap-3">
        <Icon name="moon" />
        {withLabel && <span className="whitespace-nowrap">Dark mode</span>}
      </span>
    </button>
  );
}
