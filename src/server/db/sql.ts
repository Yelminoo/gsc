import { sql } from "drizzle-orm";

/**
 * How much has been paid against the invoice row of the surrounding query.
 *
 * Written out by hand rather than built from Drizzle column references on purpose. When a query
 * selects from a single table, Drizzle emits column names unqualified, so a correlated subquery
 * written as `where ${payments.invoiceId} = ${invoices.id}` comes out as
 * `where "invoice_id" = "id"` and Postgres resolves the bare "id" against the subquery's own
 * table, payments. That compares a payment to itself, matches nothing and silently reports every
 * invoice as unpaid. Naming both sides in full makes the correlation explicit and unambiguous.
 *
 * The outer query must therefore expose the invoices table under its own name: `.from(invoices)`
 * or `.leftJoin(invoices, ...)`, not an alias.
 */
export const PAID_ON_INVOICE = sql<string>`
  coalesce((select sum(pay.amount) from payments pay where pay.invoice_id = invoices.id), 0)`;
