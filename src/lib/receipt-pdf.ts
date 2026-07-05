import jsPDF from "jspdf";
import type { Tenant } from "./tenant";
import { periodLabel } from "./fees";

export type ReceiptData = {
  receiptNo: number;
  studentName: string;
  amount: number;
  type: string;
  period: string | null;
  method: string;
  paidAt: string; // ISO timestamp
};

export function generateReceiptPdf(tenant: Tenant, r: ReceiptData) {
  const doc = new jsPDF({ unit: "pt", format: "a5" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  doc.setFillColor(tenant.primary_color);
  doc.rect(0, 0, w, 6, "F");

  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text(tenant.name, margin, y);

  if (tenant.tagline) {
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(tenant.tagline, margin, y);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text("FEE RECEIPT", w - margin, margin + 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`No. ${r.receiptNo}`, w - margin, margin + 26, { align: "right" });

  y += 22;
  doc.setDrawColor(220);
  doc.line(margin, y, w - margin, y);

  y += 24;
  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    doc.text(value, margin + 110, y);
    y += 20;
  };

  row("Received from", r.studentName);
  row(
    "Date",
    new Date(r.paidAt).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
  );
  row(
    "Towards",
    r.period
      ? `${prettyType(r.type)} fees · ${periodLabel(r.period)}`
      : `${prettyType(r.type)} fees`,
  );
  row("Payment mode", r.method.toUpperCase());

  y += 6;
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y - 14, w - margin * 2, 44, 6, 6, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Amount received", margin + 14, y + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text(`Rs. ${r.amount.toLocaleString("en-IN")}`, w - margin - 14, y + 8, { align: "right" });

  y += 58;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text("Thank you! This is a computer-generated receipt.", margin, y);

  const footerY = doc.internal.pageSize.getHeight() - 28;
  const parts = [tenant.phone, tenant.email, tenant.address].filter(Boolean).join("  ·  ");
  if (parts) {
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(parts, w - margin * 2), margin, footerY);
  }

  doc.save(`${tenant.slug}-receipt-${r.receiptNo}.pdf`);
}

function prettyType(t: string): string {
  if (t === "monthly") return "Monthly";
  if (t === "registration") return "Registration";
  if (t === "personal_coaching") return "Personal coaching";
  return "Other";
}
