import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { mmk } from "@/lib/money";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  h1: { fontSize: 20, marginBottom: 4 },
  muted: { color: "#555" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5, borderColor: "#ccc" },
  block: { marginTop: 18 },
  bold: { fontFamily: "Helvetica-Bold" },
});

export type InvoicePdfData = {
  invoiceNumber: string; issueDate: string; dueDate: string; status: string;
  studentName: string; studentCode: string;
  items: { description: string; quantity: number; unitPrice: string }[];
  amount: string; paid: string; outstanding: string;
};

export function InvoicePdf({ d }: { d: InvoicePdfData }) {
  return (
    <Document title={`Invoice ${d.invoiceNumber}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>GEMS &amp; JEWELRY School</Text>
        <Text style={s.muted}>Invoice {d.invoiceNumber}</Text>
        <View style={s.block}>
          <Text>Student: {d.studentName} ({d.studentCode})</Text>
          <Text>Issued: {d.issueDate}   Due: {d.dueDate}   Status: {d.status}</Text>
        </View>
        <View style={s.block}>
          <View style={[s.row, s.bold]}><Text style={{ width: "60%" }}>Description</Text><Text>Qty</Text><Text>Price</Text></View>
          {d.items.map((it, i) => (
            <View key={i} style={s.row}><Text style={{ width: "60%" }}>{it.description}</Text><Text>{it.quantity}</Text><Text>{mmk(it.unitPrice)}</Text></View>
          ))}
        </View>
        <View style={s.block}>
          <View style={s.row}><Text>Total</Text><Text>{mmk(d.amount)}</Text></View>
          <View style={s.row}><Text>Paid</Text><Text>{mmk(d.paid)}</Text></View>
          <View style={[s.row, s.bold]}><Text>Outstanding</Text><Text>{mmk(d.outstanding)}</Text></View>
        </View>
      </Page>
    </Document>
  );
}
