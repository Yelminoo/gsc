import { cookies } from "next/headers";
import { requireUser } from "@/server/auth/dal";
import { getDb } from "@/server/db";
import { unreadNotificationCount } from "@/server/queries";
import { Shell, type NavItem } from "@/components/ui/shell";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const collapsed = (await cookies()).get("sidebar")?.value === "collapsed";
  const unread = await unreadNotificationCount(getDb());

  const nav: NavItem[] = [
    { href: "/students", label: "Students", icon: "students" },
    { href: "/invoices", label: "Invoices", icon: "invoices" },
    { href: "/payments", label: "Payments", icon: "payments" },
    { href: "/exams", label: "Exams", icon: "exams" },
    { href: "/reminders", label: "Reminders", icon: "reminders", badge: unread },
    { href: "/terms", label: "Payment terms", icon: "terms" },
    { href: "/programs", label: "Programs", icon: "programs" },
    { href: "/reports", label: "Reports", icon: "reports" },
  ];

  return (
    <Shell nav={nav} user={{ email: user.email, role: user.role }} initialCollapsed={collapsed}>
      {children}
    </Shell>
  );
}
