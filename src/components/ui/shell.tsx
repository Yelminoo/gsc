"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { logoutAction } from "@/server/actions/auth";
import { GscLockup, GscMark } from "./brand";
import { Icon, type IconName } from "./icons";
import { ThemeToggle } from "./theme-toggle";

export type NavItem = {
  href: string; label: string; icon: IconName;
  /** Unread count shown beside the label, and as a dot when the rail is collapsed. */
  badge?: number;
};
type User = { email: string; role: string };

const YEAR = 60 * 60 * 24 * 365;

/**
 * App frame.
 * Desktop: a sidebar that folds into an icon rail (remembered in a cookie, Ctrl/Cmd+B toggles it).
 * Mobile: the sidebar is hidden behind a menu button and slides over the page as a drawer.
 */
export function Shell({ nav, user, initialCollapsed, children }: {
  nav: NavItem[]; user: User; initialCollapsed: boolean; children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [open, setOpen] = useState(false);

  const setRail = (next: boolean) => {
    setCollapsed(next);
    document.cookie = `sidebar=${next ? "collapsed" : "expanded"}; path=/; max-age=${YEAR}; samesite=lax`;
  };

  // Ctrl/Cmd+B folds the desktop sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        const next = !collapsed;
        setCollapsed(next);
        document.cookie = `sidebar=${next ? "collapsed" : "expanded"}; path=/; max-age=${YEAR}; samesite=lax`;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed]);

  // Drawer: Escape closes it, and the page behind does not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={`sticky top-0 z-30 hidden h-screen shrink-0 border-r border-line bg-bg/70 backdrop-blur-xl transition-[width] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] lg:block ${
          collapsed ? "w-[76px]" : "w-[256px]"
        }`}
      >
        <SidebarBody nav={nav} user={user} collapsed={collapsed} onToggleRail={() => setRail(!collapsed)} />
      </aside>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`} inert={!open} aria-hidden={!open}>
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/45 backdrop-blur-[3px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
          className={`absolute inset-y-0 left-0 w-[284px] max-w-[85vw] border-r border-line bg-surface shadow-[0_0_60px_-10px_var(--shadow)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-tint/5 hover:text-ink"
          >
            <Icon name="close" />
          </button>
          <SidebarBody nav={nav} user={user} collapsed={false} onNavigate={() => setOpen(false)} />
        </aside>
      </div>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/75 px-3 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-tint/5 hover:text-ink"
          >
            <Icon name="menu" />
          </button>
          <GscLockup className="h-7" />
          <ThemeToggle className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-tint/5 hover:text-ink" />
        </header>

        <main className="stagger mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:px-12 lg:py-12">{children}</main>
      </div>
    </div>
  );
}

function SidebarBody({ nav, user, collapsed, onToggleRail, onNavigate }: {
  nav: NavItem[]; user: User; collapsed: boolean; onToggleRail?: () => void; onNavigate?: () => void;
}) {
  const path = usePathname();
  const row = `group relative flex h-10 w-full items-center rounded-lg text-sm transition-colors ${collapsed ? "justify-center" : "gap-2.5 px-3"}`;
  // Labels fade out as the rail folds; they stay readable to screen readers via aria-label.
  const label = `overflow-hidden whitespace-nowrap transition-opacity duration-200 ${collapsed ? "sr-only" : "opacity-100"}`;

  return (
    <div className="flex h-full flex-col px-3 py-5">
      {/* Brand */}
      <div className={`mb-8 flex items-center ${collapsed ? "h-10 justify-center" : "flex-col items-start gap-2.5 px-1.5"}`}>
        {collapsed ? (
          <GscMark className="h-8" />
        ) : (
          <>
            <GscLockup className="h-11" />
            <span className="block text-[10px] font-medium uppercase tracking-[0.28em] text-muted">Yangon · Admin</span>
          </>
        )}
      </div>

      {/* Navigation */}
      <p className={`mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.28em] text-muted/70 ${collapsed ? "sr-only" : ""}`}>Manage</p>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {nav.map((n, i) => {
          const active = path === n.href || path.startsWith(`${n.href}/`);
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? n.label : undefined}
              className={`${row} ${active ? "bg-tint/5 text-ink" : "text-muted hover:bg-tint/3 hover:text-ink-2"}`}
            >
              <span aria-hidden className={`absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 bg-gold transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
              <span className={active ? "text-gold" : ""}><Icon name={n.icon} /></span>
              {/* Ledger's numbered contents list. Decorative: the label is the accessible name. */}
              <span aria-hidden className={`${label} w-5 shrink-0 text-[10px] font-medium tabular-nums ${active ? "text-gold" : "text-muted/60"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={`${label} min-w-0 truncate`}>{n.label}</span>
              {n.badge ? (
                <>
                  <span className={`${label} ml-auto shrink-0 rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-on-gold`}>
                    {n.badge > 99 ? "99+" : n.badge}
                  </span>
                  {/* On the rail there is no room for a number, so a dot carries the same news. */}
                  {collapsed && <span aria-hidden className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-gold" />}
                  <span className="sr-only">{n.badge} unread</span>
                </>
              ) : null}
              {collapsed && <Tip>{n.label}</Tip>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto flex flex-col gap-1 border-t border-line pt-4">
        <div className="relative">
          <ThemeToggle withLabel={!collapsed} className={`${row} text-muted hover:bg-tint/3 hover:text-ink-2`} />
          {collapsed && <span className="group pointer-events-none absolute inset-0"><Tip>Switch theme</Tip></span>}
        </div>

        {onToggleRail && (
          <button
            type="button"
            onClick={onToggleRail}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-keyshortcuts="Control+B"
            className={`${row} text-muted hover:bg-tint/3 hover:text-ink-2`}
          >
            <Icon name={collapsed ? "expand" : "collapse"} />
            <span className={label}>Collapse</span>
            {!collapsed && <kbd className="ml-auto rounded border border-line px-1.5 font-sans text-[10px] text-muted/80">Ctrl B</kbd>}
            {collapsed && <Tip>Expand · Ctrl B</Tip>}
          </button>
        )}

        <form action={logoutAction} className={`mt-3 flex items-center rounded-xl border border-line bg-tint/2 p-2 ${collapsed ? "flex-col gap-2" : "gap-3"}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 font-display text-sm text-gold" title={`${user.email} (${user.role})`}>
            {user.email.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-xs text-ink-2" title={user.email}>{user.email}</span>
              <span className="block text-[10px] uppercase tracking-[0.2em] text-muted">{user.role}</span>
            </span>
          )}
          <button aria-label="Sign out" title="Sign out" className="group relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-bad/10 hover:text-bad">
            <Icon name="logout" className="h-4 w-4" />
            {collapsed && <Tip>Sign out</Tip>}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Hover / focus label for the folded rail. */
function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-md border border-line-strong bg-surface-2 px-2.5 py-1 text-xs text-ink opacity-0 shadow-[0_8px_24px_-8px_var(--shadow)] transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}
