import Link from "next/link";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { listStudents } from "@/server/queries";
import { mmk } from "@/lib/money";
import { Badge, LinkButton, PageHeader, Pager, parsePage, sheet, td, th } from "@/components/ui/page";

export default async function StudentsPage(props: PageProps<"/students">) {
  await requireUser();
  const sp = await props.searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const page = parsePage(sp.page);
  const data = await listStudents(getDb(), { q: q || undefined, page });

  return (
    <>
      <PageHeader eyebrow="Registry" title="Students" actions={<LinkButton href="/students/new">Register student</LinkButton>} />
      {sp.denied && <p className="mb-4 rounded-lg border border-bad/25 bg-bad/8 px-3.5 py-2.5 text-sm text-bad">You do not have access to that page.</p>}
      <form className="mb-4 flex gap-2" action="/students">
        <input name="q" defaultValue={q} placeholder="Search name, code or phone" maxLength={80}
          className="w-full max-w-sm rounded-lg border border-line-strong bg-tint/[0.025] px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 transition focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10" />
        <button className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-tint/[0.02] px-4 py-2.5 text-sm text-ink-2 transition-colors hover:border-gold/40 hover:text-ink">Search</button>
      </form>
      <div className={sheet}>
        <table className="min-w-full divide-y divide-line">
          <thead><tr><th className={th}>Code</th><th className={th}>Name</th><th className={th}>Program</th><th className={th}>Phone</th><th className={th}>Status</th><th className={th}>Outstanding</th></tr></thead>
          <tbody className="divide-y divide-line">
            {data.items.map((s) => (
              <tr key={s.id}>
                <td className={td}>{s.studentCode}</td>
                <td className={td}><Link className="text-gold transition-colors hover:text-gold-soft" href={`/students/${s.id}`}>{s.fullName}</Link></td>
                <td className={td}>{s.program ?? "-"}</td>
                <td className={td}>{s.phone ?? "-"}</td>
                <td className={td}><Badge tone={s.status === "active" ? "green" : "slate"}>{s.status}</Badge></td>
                <td className={td}>{mmk(s.outstanding)}</td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td className={td} colSpan={6}>No students found.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/students" page={page} total={data.total} pageSize={data.pageSize} params={{ q: q || undefined }} />
    </>
  );
}
