import { renderToBuffer } from "@react-pdf/renderer";
import { getDb } from "@/server/db";
import { getCurrentUser } from "@/server/auth/dal";
import { getInvoice } from "@/server/queries";
import { InvoicePdf } from "@/components/pdf/invoice-pdf";
import { numericToPya, toNumeric } from "@/lib/money";
import { idSchema } from "@/lib/validators";

export async function GET(_req: Request, ctx: RouteContext<"/invoices/[id]/pdf">) {
  // Route handlers are NOT covered by layout auth: verify the session here.
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return new Response("Not found", { status: 404 });
  const data = await getInvoice(getDb(), id);
  if (!data) return new Response("Not found", { status: 404 });

  const { invoice, items } = data;
  const pdf = await renderToBuffer(
    <InvoicePdf d={{
      invoiceNumber: invoice.invoiceNumber, issueDate: invoice.issueDate, dueDate: invoice.dueDate,
      status: invoice.status, studentName: invoice.studentName, studentCode: invoice.studentCode,
      items, amount: invoice.amount, paid: invoice.paid,
      outstanding: toNumeric(numericToPya(invoice.amount) - numericToPya(invoice.paid)),
    }} />,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
