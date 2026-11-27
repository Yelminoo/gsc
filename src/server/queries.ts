import { sql, type SQL } from "drizzle-orm";
import type { DB } from "@/server/db/types";
import { addDays, today } from "@/lib/dates";

const rows = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[]));
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Invoice balances: paid = sum of payments. Overdue is derived from due_date. */
const BAL = sql`bal as (
  select i.id, i.invoice_number, i.student_id, i.amount, i.status, i.due_date, i.issue_date, i.installment_no, i.kind,
         coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0) as paid
  from invoices i
)`;

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export const PAGE_SIZE = 20;

export type StudentRow = { id: string; studentCode: string; fullName: string; phone: string | null; status: string; program: string | null; outstanding: string };

export async function listStudents(db: DB, opts: { q?: string; page: number }): Promise<Page<StudentRow>> {
  const like = opts.q ? `%${escapeLike(opts.q)}%` : null;
  const where: SQL = like
    ? sql`where s.full_name ilike ${like} escape '\\' or s.student_code ilike ${like} escape '\\' or s.phone ilike ${like} escape '\\'`
    : sql``;
  const items = rows<StudentRow>(await db.execute(sql`
    with ${BAL}
    select s.id, s.student_code as "studentCode", s.full_name as "fullName", s.phone, s.status, pr.name as program,
           coalesce(sum(b.amount - b.paid) filter (where b.status <> 'void'), 0)::text as outstanding
    from students s
    left join programs pr on pr.id = s.program_id
    left join bal b on b.student_id = s.id
    ${where}
    group by s.id, pr.name
    order by s.created_at desc
    limit ${PAGE_SIZE} offset ${(opts.page - 1) * PAGE_SIZE}`));
  const [{ n }] = rows<{ n: number }>(await db.execute(sql`
    select count(*)::int as n from students s ${where}`));
  return { items, total: n, page: opts.page, pageSize: PAGE_SIZE };
}

export async function getStudent(db: DB, id: string) {
  const [student] = rows<{
    id: string; studentCode: string; fullName: string; email: string | null; phone: string | null; dateOfBirth: string | null;
    enrollmentDate: string; status: string; programId: string | null; program: string | null; tuitionFee: string | null;
  }>(await db.execute(sql`
    select s.id, s.student_code as "studentCode", s.full_name as "fullName", s.email, s.phone,
           s.date_of_birth as "dateOfBirth", s.enrollment_date as "enrollmentDate", s.status,
           s.program_id as "programId", pr.name as program, pr.tuition_fee::text as "tuitionFee"
    from students s left join programs pr on pr.id = s.program_id where s.id = ${id}`));
  if (!student) return null;
  const guardians = rows<{ id: string; name: string; relationship: string | null; phone: string | null }>(
    await db.execute(sql`select id, name, relationship, phone from guardians where student_id = ${id}`));
  const invoices = await listInvoiceBalances(db, { studentId: id });
  return { student, guardians, invoices };
}

export type InvoiceRow = {
  id: string; invoiceNumber: string; studentId: string; studentName: string; studentCode: string;
  amount: string; paid: string; status: string; dueDate: string; issueDate: string; installmentNo: number | null;
  kind: "tuition" | "exam" | "other"; overdue: boolean;
};

export async function listInvoiceBalances(db: DB, opts: { studentId?: string; invoiceId?: string; filter?: string; page?: number }) {
  const t = today();
  const conds: SQL[] = [];
  if (opts.studentId) conds.push(sql`b.student_id = ${opts.studentId}`);
  if (opts.invoiceId) conds.push(sql`b.id = ${opts.invoiceId}`);
  switch (opts.filter) {
    case "open": conds.push(sql`b.status in ('issued','partial')`); break;
    case "paid": conds.push(sql`b.status = 'paid'`); break;
    case "void": conds.push(sql`b.status = 'void'`); break;
    case "overdue": conds.push(sql`b.status in ('issued','partial') and b.due_date < ${t}`); break;
  }
  const where = conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``;
  const page = opts.page ?? 1;
  const paging = opts.page ? sql`limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}` : sql``;
  const items = rows<Omit<InvoiceRow, "overdue">>(await db.execute(sql`
    with ${BAL}
    select b.id, b.invoice_number as "invoiceNumber", b.student_id as "studentId", s.full_name as "studentName",
           s.student_code as "studentCode", b.amount::text as amount, b.paid::text as paid, b.status,
           b.due_date as "dueDate", b.issue_date as "issueDate", b.installment_no as "installmentNo", b.kind::text as kind
    from bal b join students s on s.id = b.student_id
    ${where}
    order by b.issue_date desc, b.invoice_number desc ${paging}`));
  const [{ n }] = rows<{ n: number }>(await db.execute(sql`
    with ${BAL} select count(*)::int as n from bal b ${where}`));
  return Object.assign(
    items.map((r) => ({ ...r, overdue: (r.status === "issued" || r.status === "partial") && r.dueDate < t })),
    { total: n },
  ) as InvoiceRow[] & { total: number };
}

export async function getInvoice(db: DB, id: string) {
  const [inv] = await listInvoiceBalances(db, { invoiceId: id });
  if (!inv) return null;
  const items = rows<{ description: string; quantity: number; unitPrice: string }>(await db.execute(sql`
    select description, quantity, unit_price::text as "unitPrice" from invoice_items where invoice_id = ${id}`));
  const pays = rows<{ id: string; amount: string; paidDate: string; method: string; reference: string | null }>(await db.execute(sql`
    select id, amount::text as amount, paid_date as "paidDate", method, reference from payments where invoice_id = ${id} order by paid_date, created_at`));
  return { invoice: inv, items, payments: pays };
}

export async function listPayments(db: DB, page: number): Promise<Page<{
  id: string; amount: string; paidDate: string; method: string; reference: string | null; invoiceId: string; invoiceNumber: string; studentName: string;
}>> {
  const items = rows<{ id: string; amount: string; paidDate: string; method: string; reference: string | null; invoiceId: string; invoiceNumber: string; studentName: string }>(
    await db.execute(sql`
      select p.id, p.amount::text as amount, p.paid_date as "paidDate", p.method, p.reference,
             i.id as "invoiceId", i.invoice_number as "invoiceNumber", s.full_name as "studentName"
      from payments p join invoices i on i.id = p.invoice_id join students s on s.id = i.student_id
      order by p.paid_date desc, p.created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`));
  const [{ n }] = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from payments`));
  return { items, total: n, page, pageSize: PAGE_SIZE };
}

export async function listPrograms(db: DB) {
  return rows<{ id: string; name: string; tuitionFee: string; hasExam: boolean; examBoard: string | null }>(
    await db.execute(sql`
      select id, name, tuition_fee::text as "tuitionFee", has_exam as "hasExam", exam_board as "examBoard"
      from programs order by name`));
}

export type NotificationRow = {
  id: string; kind: string; title: string; body: string; createdAt: string;
  readAt: string | null; studentId: string | null; studentName: string | null; invoiceId: string | null;
};

export async function listNotifications(db: DB, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  const where = opts.unreadOnly ? sql`where n.read_at is null` : sql``;
  return rows<NotificationRow>(await db.execute(sql`
    select n.id, n.kind::text, n.title, n.body, n.created_at as "createdAt", n.read_at as "readAt",
           n.student_id as "studentId", s.full_name as "studentName", n.invoice_id as "invoiceId"
    from notifications n left join students s on s.id = n.student_id
    ${where}
    order by n.created_at desc limit ${opts.limit ?? 100}`));
}

export async function unreadNotificationCount(db: DB): Promise<number> {
  const [r] = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from notifications where read_at is null`));
  return r?.n ?? 0;
}

/** Sittings with their per-program fees, and how many entries are still unpaid. */
export async function listExamSessions(db: DB) {
  return rows<{
    id: string; name: string; examDate: string; entryDeadline: string;
    entries: number; unpaid: number;
    fees: { programId: string; program: string; feeGbp: string; resitFeeGbp: string | null; fxRate: string }[];
  }>(await db.execute(sql`
    with ${BAL}
    select e.id, e.name, e.exam_date as "examDate", e.entry_deadline as "entryDeadline",
      (select count(*)::int from exam_entries x where x.session_id = e.id and x.status <> 'withdrawn') as entries,
      (select count(*)::int from exam_entries x left join bal b on b.id = x.invoice_id
        where x.session_id = e.id and x.status <> 'withdrawn' and (b.id is null or b.status = 'void' or b.amount - b.paid > 0)) as unpaid,
      coalesce((select json_agg(json_build_object(
          'programId', f.program_id, 'program', p.name, 'feeGbp', f.fee_gbp::text,
          'resitFeeGbp', f.resit_fee_gbp::text, 'fxRate', f.fx_rate::text) order by p.name)
        from exam_fees f join programs p on p.id = f.program_id where f.session_id = e.id), '[]'::json) as fees
    from exam_sessions e
    order by e.exam_date desc`));
}

export async function listEmailLog(db: DB, limit = 50) {
  return rows<{ id: string; toEmail: string; subject: string; status: string; attempts: number; lastError: string | null; sentAt: string | null; createdAt: string }>(
    await db.execute(sql`
      select id, to_email as "toEmail", subject, status::text, attempts, last_error as "lastError",
             sent_at as "sentAt", created_at as "createdAt"
      from email_outbox order by created_at desc limit ${limit}`));
}

export async function listTerms(db: DB) {
  return rows<{ id: string; name: string; discountPercent: string; installments: { installmentNo: number; percentage: string; dueOffsetDays: number }[] }>(
    await db.execute(sql`
      select t.id, t.name, t.discount_percent::text as "discountPercent",
        coalesce(json_agg(json_build_object('installmentNo', i.installment_no, 'percentage', i.percentage::text, 'dueOffsetDays', i.due_offset_days)
                 order by i.installment_no) filter (where i.id is not null), '[]'::json) as installments
      from payment_terms t left join payment_term_installments i on i.term_id = t.id
      group by t.id order by t.name`));
}

export async function reportSummary(db: DB) {
  const t = today();
  const [totals] = rows<{ invoiced: string; collected: string; outstanding: string; overdue: string; invoiceCount: number; paidCount: number }>(await db.execute(sql`
    with ${BAL}
    select coalesce(sum(amount) filter (where status <> 'void'), 0)::text as invoiced,
           coalesce(sum(paid) filter (where status <> 'void'), 0)::text as collected,
           coalesce(sum(amount - paid) filter (where status <> 'void'), 0)::text as outstanding,
           coalesce(sum(amount - paid) filter (where status <> 'void' and amount - paid > 0 and due_date < ${t}), 0)::text as overdue,
           (count(*) filter (where status <> 'void'))::int as "invoiceCount",
           (count(*) filter (where status = 'paid'))::int as "paidCount"
    from bal`));
  const from = `${addDays(t, -365).slice(0, 7)}-01`;
  // One row per month for the last 12 months, zero-filled, with both measures on the same scale.
  const monthly = rows<{ month: string; invoiced: string; collected: string }>(await db.execute(sql`
    with months as (
      select to_char(generate_series(date_trunc('month', ${from}::date), date_trunc('month', ${t}::date), interval '1 month'), 'YYYY-MM') as month
    ),
    inv as (
      select to_char(date_trunc('month', issue_date::timestamp), 'YYYY-MM') as month, sum(amount) as total
      from invoices where status <> 'void' and issue_date >= ${from} group by 1
    ),
    pay as (
      select to_char(date_trunc('month', paid_date::timestamp), 'YYYY-MM') as month, sum(amount) as total
      from payments where paid_date >= ${from} group by 1
    )
    select m.month, coalesce(inv.total, 0)::text as invoiced, coalesce(pay.total, 0)::text as collected
    from months m left join inv on inv.month = m.month left join pay on pay.month = m.month
    order by m.month`));

  // Receivables by age, an ordered set of bands.
  const [ageing] = rows<{ current: string; d1: string; d31: string; d61: string }>(await db.execute(sql`
    with ${BAL}
    select coalesce(sum(amount - paid) filter (where due_date >= ${t}), 0)::text as current,
           coalesce(sum(amount - paid) filter (where due_date < ${t} and due_date >= ${t}::date - 30), 0)::text as d1,
           coalesce(sum(amount - paid) filter (where due_date < ${t}::date - 30 and due_date >= ${t}::date - 60), 0)::text as d31,
           coalesce(sum(amount - paid) filter (where due_date < ${t}::date - 60), 0)::text as d61
    from bal where status <> 'void' and amount - paid > 0`));

  // Invoice counts by state, with overdue derived rather than stored.
  const [statusCounts] = rows<{ paid: number; partial: number; unpaid: number; overdue: number; void: number }>(await db.execute(sql`
    with ${BAL}
    select (count(*) filter (where status = 'paid'))::int as paid,
           (count(*) filter (where status = 'partial' and due_date >= ${t}))::int as partial,
           (count(*) filter (where status = 'issued' and due_date >= ${t}))::int as unpaid,
           (count(*) filter (where status in ('issued','partial') and due_date < ${t}))::int as overdue,
           (count(*) filter (where status = 'void'))::int as "void"
    from bal`));
  const byMethod = rows<{ method: string; collected: string; count: number }>(await db.execute(sql`
    select method::text, sum(amount)::text as collected, count(*)::int as count from payments group by method order by sum(amount) desc`));
  const overdueList = rows<{ invoiceId: string; invoiceNumber: string; studentName: string; dueDate: string; outstanding: string }>(await db.execute(sql`
    with ${BAL}
    select b.id as "invoiceId", b.invoice_number as "invoiceNumber", s.full_name as "studentName", b.due_date as "dueDate",
           (b.amount - b.paid)::text as outstanding
    from bal b join students s on s.id = b.student_id
    where b.status in ('issued','partial') and b.due_date < ${t}
    order by b.due_date limit 50`));
  const [counts] = rows<{ students: number; active: number }>(await db.execute(sql`
    select count(*)::int as students, (count(*) filter (where status = 'active'))::int as active from students`));
  return { totals, monthly, byMethod, overdueList, counts, ageing, statusCounts, asOf: t };
}
