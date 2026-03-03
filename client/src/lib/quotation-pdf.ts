import jsPDF from "jspdf";
import type { Quotation, QuotationItem, Customer } from "@shared/schema";

const COLORS = {
  headerBg: [30, 41, 59] as [number, number, number],
  headerText: [255, 255, 255] as [number, number, number],
  accent: [59, 130, 246] as [number, number, number],
  textPrimary: [15, 23, 42] as [number, number, number],
  textSecondary: [100, 116, 139] as [number, number, number],
  tableBorder: [226, 232, 240] as [number, number, number],
  tableHeader: [241, 245, 249] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

function formatCurrency(val: number | string): string {
  return `Rs. ${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number) {
  doc.roundedRect(x, y, w, h, r, r, "F");
}

export function generateQuotationPDF(
  quotation: Quotation,
  items: QuotationItem[],
  customer: Customer | undefined
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, pageWidth, 48, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.headerText);
  doc.text("ITFI Group", margin, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(180, 190, 210);
  doc.text("A subsidiary of ITFI Group", margin, 24);

  doc.setFontSize(7.5);
  doc.text("admin@itfi.co.in", pageWidth - margin, 15, { align: "right" });
  doc.text("www.itfi.co.in", pageWidth - margin, 20, { align: "right" });

  doc.setFillColor(59, 130, 246);
  doc.rect(0, 34, pageWidth, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.white);
  doc.text("QUOTATION", pageWidth / 2, 42.5, { align: "center" });

  y = 56;

  doc.setFillColor(248, 250, 252);
  drawRoundedRect(doc, margin, y, contentWidth, 28, 2);

  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Quote Number", margin + 4, y + 6);
  doc.text("Date", margin + 55, y + 6);
  doc.text("Valid Until", margin + 100, y + 6);
  doc.text("Status", pageWidth - margin - 4, y + 6, { align: "right" });

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFont("helvetica", "bold");
  doc.text(quotation.quoteNumber, margin + 4, y + 12);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(quotation.createdAt).toLocaleDateString("en-IN"), margin + 55, y + 12);
  doc.text(quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString("en-IN") : "—", margin + 100, y + 12);

  const statusLabel = quotation.status.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  doc.text(statusLabel, pageWidth - margin - 4, y + 12, { align: "right" });

  if (customer) {
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("Bill To", margin + 4, y + 19);

    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textPrimary);
    doc.setFont("helvetica", "bold");
    let customerLine = customer.name;
    doc.text(customerLine, margin + 4, y + 24);
    doc.setFont("helvetica", "normal");

    const custDetails: string[] = [];
    if (customer.phone) custDetails.push(customer.phone);
    if (customer.email) custDetails.push(customer.email);
    if (customer.gstNumber) custDetails.push(`GST: ${customer.gstNumber}`);
    if (custDetails.length > 0) {
      doc.setFontSize(7.5);
      doc.text(custDetails.join("  |  "), margin + 55, y + 24);
    }
    if (customer.address) {
      doc.setFontSize(7.5);
      doc.setTextColor(...COLORS.textSecondary);
      const addressLines = doc.splitTextToSize(customer.address, 120);
      doc.text(addressLines, pageWidth - margin - 4, y + 19, { align: "right" });
    }
  }

  y += 34;

  const colX = {
    no: margin,
    type: margin + 10,
    desc: margin + 30,
    qty: margin + 115,
    unit: margin + 130,
    total: pageWidth - margin,
  };
  const tableHeaderH = 8;

  doc.setFillColor(...COLORS.tableHeader);
  drawRoundedRect(doc, margin, y, contentWidth, tableHeaderH, 1);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("#", colX.no + 2, y + 5.5);
  doc.text("Type", colX.type, y + 5.5);
  doc.text("Description", colX.desc, y + 5.5);
  doc.text("Qty", colX.qty, y + 5.5, { align: "right" });
  doc.text("Unit Price", colX.unit + 15, y + 5.5, { align: "right" });
  doc.text("Total", colX.total - 2, y + 5.5, { align: "right" });

  y += tableHeaderH;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  let subtotal = 0;
  items.forEach((item, idx) => {
    const rowH = 7;
    const maxPageY = doc.internal.pageSize.getHeight() - 40;
    if (y + rowH > maxPageY) {
      doc.addPage();
      y = 20;
    }

    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, rowH, "F");
    }

    doc.setDrawColor(...COLORS.tableBorder);
    doc.line(margin, y + rowH, pageWidth - margin, y + rowH);

    doc.setTextColor(...COLORS.textPrimary);
    doc.text(String(idx + 1), colX.no + 2, y + 5);

    const typeLabel = (item.itemType === "service") ? "Service" : "Product";
    doc.setTextColor(item.itemType === "service" ? 234 : 59, item.itemType === "service" ? 88 : 130, item.itemType === "service" ? 12 : 246);
    doc.text(typeLabel, colX.type, y + 5);

    doc.setTextColor(...COLORS.textPrimary);
    const descText = doc.splitTextToSize(item.description || "—", 80);
    doc.text(descText[0], colX.desc, y + 5);
    doc.text(String(item.quantity), colX.qty, y + 5, { align: "right" });
    doc.text(formatCurrency(item.unitPrice), colX.unit + 15, y + 5, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrency(item.totalPrice), colX.total - 2, y + 5, { align: "right" });
    doc.setFont("helvetica", "normal");

    subtotal += Number(item.totalPrice);
    y += rowH;
  });

  y += 4;

  const summaryX = pageWidth - margin - 80;
  const summaryWidth = 80;
  const hasDiscount = quotation.discountType && quotation.discountValue && Number(quotation.discountValue) > 0;

  doc.setFillColor(248, 250, 252);
  drawRoundedRect(doc, summaryX, y, summaryWidth, hasDiscount ? 28 : 18, 2);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Subtotal", summaryX + 4, y + 6);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(formatCurrency(subtotal), summaryX + summaryWidth - 4, y + 6, { align: "right" });

  if (hasDiscount) {
    const discountAmt = quotation.discountType === "percentage"
      ? subtotal * Number(quotation.discountValue) / 100
      : Number(quotation.discountValue);
    const discountLabel = quotation.discountType === "percentage"
      ? `Discount (${Number(quotation.discountValue)}%)`
      : "Discount";

    doc.setTextColor(220, 38, 38);
    doc.text(discountLabel, summaryX + 4, y + 13);
    doc.text(`- ${formatCurrency(discountAmt)}`, summaryX + summaryWidth - 4, y + 13, { align: "right" });

    doc.setDrawColor(...COLORS.tableBorder);
    doc.line(summaryX + 4, y + 16, summaryX + summaryWidth - 4, y + 16);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textPrimary);
    doc.text("Net Total", summaryX + 4, y + 23);
    doc.text(formatCurrency(quotation.totalAmount), summaryX + summaryWidth - 4, y + 23, { align: "right" });

    y += 28;
  } else {
    doc.setDrawColor(...COLORS.tableBorder);
    doc.line(summaryX + 4, y + 9, summaryX + summaryWidth - 4, y + 9);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textPrimary);
    doc.text("Total", summaryX + 4, y + 15);
    doc.text(formatCurrency(quotation.totalAmount), summaryX + summaryWidth - 4, y + 15, { align: "right" });

    y += 18;
  }

  if (quotation.notes) {
    y += 8;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("NOTES", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textPrimary);
    const noteLines = doc.splitTextToSize(quotation.notes, contentWidth - 10);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4;
  }

  y += 10;
  const termsY = Math.max(y, doc.internal.pageSize.getHeight() - 35);
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(margin, termsY, pageWidth - margin, termsY);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("TERMS & CONDITIONS", margin, termsY + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text("1. This quotation is valid for the period mentioned above.", margin, termsY + 10);
  doc.text("2. Prices are subject to change without prior notice after validity period.", margin, termsY + 14);
  doc.text("3. GST and other applicable taxes will be charged extra unless mentioned otherwise.", margin, termsY + 18);

  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text("This is a system-generated quotation and does not require a signature.", pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });

  doc.save(`${quotation.quoteNumber}.pdf`);
}
