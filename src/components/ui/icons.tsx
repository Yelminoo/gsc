import type { ReactNode } from "react";

/** Hairline icon set, 24px grid, drawn with currentColor. */
const paths = {
  students: <><circle cx="9" cy="7.5" r="3.5" /><path d="M2.5 19.5v-.5a4.5 4.5 0 0 1 4.5-4.5h4a4.5 4.5 0 0 1 4.5 4.5v.5M16 4.2a3.5 3.5 0 0 1 0 6.6M21.5 19.5v-.5a4.5 4.5 0 0 0-3.2-4.3" /></>,
  invoices: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  payments: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h3" /></>,
  terms: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M8 2.5v4M16 2.5v4M3 10h18M8 14.5h2M14 14.5h2" /></>,
  programs: <><path d="M22 9 12 4 2 9l10 5z" /><path d="M6 11v5c0 1.4 2.7 3 6 3s6-1.6 6-3v-5M22 9v5" /></>,
  reports: <><path d="M3 3v18h18" /><path d="M8 16v-5M13 16V7.5M18 16v-3" /></>,
  exams: <><path d="M4 4.5h10.5a2 2 0 0 1 2 2V21H6a2 2 0 0 1-2-2z" /><path d="M8 9h5M8 13h5" /><path d="m15.5 16.5 2.2 2.2L22 14" /></>,
  reminders: <><path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5" /><path d="M13.7 19a2 2 0 0 1-3.4 0" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  collapse: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16M15.5 10l-2 2 2 2" /></>,
  expand: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16M13.5 10l2 2-2 2" /></>,
  logout: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16.5 14.5 12 10 7.5M14.5 12H3.5" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, className = "h-[18px] w-[18px]" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}
