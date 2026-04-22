import jsPDF from "jspdf";
import type { Quotation, QuotationItem, Customer, Product } from "@shared/schema";

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

/** Phase 7 — bundleItemsMap: bundle product id → list of components (name + qty + unit).
 *  Component GST rates are NOT shown on customer-facing PDFs per CEO directive.
 *  Only the bundle's declared GST rate appears in the totals block. */
export type BundlePdfComponent = { name: string; quantity: number; unit: string; gstRate: number };

export function generateQuotationPDF(
  quotation: Quotation,
  items: QuotationItem[],
  customer: Customer | undefined,
  products?: Product[],
  bundleItemsMap?: Record<string, BundlePdfComponent[]>
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

  const hasDelivery = (quotation as any).deliveryMethod === "delivery";
  const detailsBoxHeight = hasDelivery ? 36 : 28;
  doc.setFillColor(248, 250, 252);
  drawRoundedRect(doc, margin, y, contentWidth, detailsBoxHeight, 2);

  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Quote Number", margin + 4, y + 6);
  doc.text("Date", margin + 50, y + 6);
  doc.text("Valid Until", margin + 85, y + 6);
  doc.text("Expected Delivery", margin + 120, y + 6);
  doc.text("Status", pageWidth - margin - 4, y + 6, { align: "right" });

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFont("helvetica", "bold");
  doc.text(quotation.quoteNumber, margin + 4, y + 12);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(quotation.createdAt).toLocaleDateString("en-IN"), margin + 50, y + 12);
  doc.text(quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString("en-IN") : "—", margin + 85, y + 12);
  doc.text(quotation.expectedDeliveryDate ? new Date(quotation.expectedDeliveryDate).toLocaleDateString("en-IN") : "—", margin + 120, y + 12);

  const statusLabel = quotation.status.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  doc.text(statusLabel, pageWidth - margin - 4, y + 12, { align: "right" });

  if (customer) {
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("Bill To", margin + 4, y + 19);

    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textPrimary);
    doc.setFont("helvetica", "bold");
    doc.text(customer.name, margin + 4, y + 24);
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

  if (hasDelivery) {
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("Delivery Method", margin + 4, y + 29);
    doc.setFontSize(8);
    doc.setTextColor(COLORS.accent[0], COLORS.accent[1], COLORS.accent[2]);
    doc.setFont("helvetica", "bold");
    doc.text("Delivery", margin + 35, y + 29);
    doc.setFont("helvetica", "normal");
    if ((quotation as any).deliveryAddress) {
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.textSecondary);
      doc.text("Deliver To:", margin + 55, y + 29);
      doc.setTextColor(...COLORS.textPrimary);
      const addrText = doc.splitTextToSize((quotation as any).deliveryAddress, 80);
      doc.text(addrText[0] || "", margin + 75, y + 29);
    }
    y += detailsBoxHeight + 6;
  } else {
    y += 34;
  }

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
  doc.text("Unit Price (ex-GST)", colX.unit + 15, y + 5.5, { align: "right" });
  doc.text("Total (ex-GST)", colX.total - 2, y + 5.5, { align: "right" });

  y += tableHeaderH;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  let subtotal = 0;
  items.forEach((item, idx) => {
    const prod = products?.find(p => p.id === item.productId);
    const warranty = prod?.warrantyPeriod && String(prod.warrantyPeriod).trim() ? String(prod.warrantyPeriod).trim() : null;
    // Phase 7 — bundle sub-lines (one row per component, no pricing, no component GST)
    const isBundle = prod?.type === "bundle";
    const bundleComps = isBundle && item.productId ? (bundleItemsMap?.[item.productId] ?? []) : [];
    // sub-lines height: each comp row = 4mm; footnote = 4mm
    const bundleSubH = isBundle ? (bundleComps.length * 4) + (bundleComps.length > 0 ? 4 : 0) : 0;
    const rowH = (warranty ? 12 : 7) + bundleSubH;

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

    // Type label: Bundle gets its own label in purple-ish
    const typeLabel = isBundle ? "Bundle" : (item.itemType === "service" ? "Service" : "Product");
    const typeR = isBundle ? 109 : (item.itemType === "service" ? 234 : 59);
    const typeG = isBundle ? 40  : (item.itemType === "service" ? 88  : 130);
    const typeB = isBundle ? 217 : (item.itemType === "service" ? 12  : 246);
    doc.setTextColor(typeR, typeG, typeB);
    doc.text(typeLabel, colX.type, y + 5);

    doc.setTextColor(...COLORS.textPrimary);
    const descText = doc.splitTextToSize(item.description || "—", 80);
    doc.text(descText[0], colX.desc, y + 5);
    doc.text(String(item.quantity), colX.qty, y + 5, { align: "right" });
    doc.text(formatCurrency(item.unitPrice), colX.unit + 15, y + 5, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrency(item.totalPrice), colX.total - 2, y + 5, { align: "right" });
    doc.setFont("helvetica", "normal");

    if (warranty) {
      doc.setFontSize(6);
      doc.setTextColor(...COLORS.textSecondary);
      doc.text(`Warranty: ${warranty}`, colX.desc, y + 10);
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.textPrimary);
    }

    // Phase 7 — bundle component sub-lines: name + qty + unit ONLY (no GST — CEO directive).
    // A footnote after the last sub-line shows the bundle's own GST rate.
    if (isBundle && bundleComps.length > 0) {
      const baseY = y + (warranty ? 12 : 7);
      doc.setFontSize(6.5);
      doc.setTextColor(...COLORS.textSecondary);
      bundleComps.forEach((comp, ci) => {
        const subY = baseY + ci * 4 + 2;
        const totalQty = Number(comp.quantity) * Number(item.quantity || 1);
        doc.text(`> ${comp.name}`, colX.desc + 2, subY);
        doc.text(`${totalQty} ${comp.unit}`, colX.qty, subY, { align: "right" });
        // No GST rate shown per CEO directive — components' rates are informational only.
      });
      // Footnote: bundle's own GST rate, rendered italic after the last sub-line.
      const bundleGstRate = Number((item as any).gstRate || 0);
      if (bundleComps.length > 0) {
        const footnoteY = baseY + bundleComps.length * 4 + 2;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6);
        doc.setTextColor(148, 163, 184);
        doc.text(`(invoiced as one bundle @ ${bundleGstRate}% GST)`, colX.desc + 2, footnoteY);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
      }
      doc.setTextColor(...COLORS.textPrimary);
    }

    subtotal += Number(item.totalPrice);
    y += rowH;
  });

  y += 4;

  // Compute GST groups: aggregate taxAmount by gstRate across all line items.
  // taxAmount = 0 for old items without the column — they will produce no GST lines.
  const gstGroupMap: Record<number, number> = {};
  items.forEach(item => {
    const rate = Number((item as any).gstRate || 0);
    const tax  = Number((item as any).taxAmount || 0);
    if (rate > 0 && tax > 0) {
      gstGroupMap[rate] = (gstGroupMap[rate] || 0) + tax;
    }
  });
  const gstLines = Object.entries(gstGroupMap)
    .map(([rate, tax]) => ({ rate: Number(rate), tax }))
    .sort((a, b) => a.rate - b.rate);

  const summaryX = pageWidth - margin - 80;
  const summaryWidth = 80;
  const hasDiscount = quotation.discountType && quotation.discountValue && Number(quotation.discountValue) > 0;
  const deliveryCost = hasDelivery && (quotation as any).deliveryCost ? Number((quotation as any).deliveryCost) : 0;
  const hasDeliveryCostLine = deliveryCost > 0;

  let summaryBoxH = 18; // base: subtotal row + divider + net total row
  if (hasDiscount) summaryBoxH += 7;
  summaryBoxH += gstLines.length * 7; // one row per GST rate
  if (hasDeliveryCostLine) summaryBoxH += 7;

  doc.setFillColor(248, 250, 252);
  drawRoundedRect(doc, summaryX, y, summaryWidth, summaryBoxH, 2);

  let lineY = y + 6;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  // Label subtotal as "Subtotal (ex-GST)" whenever there are GST lines to show.
  const subtotalLabel = gstLines.length > 0 ? "Subtotal (ex-GST)" : "Subtotal";
  doc.text(subtotalLabel, summaryX + 4, lineY);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(formatCurrency(subtotal), summaryX + summaryWidth - 4, lineY, { align: "right" });

  if (hasDiscount) {
    lineY += 7;
    const discountAmt = quotation.discountType === "percentage"
      ? subtotal * Number(quotation.discountValue) / 100
      : Number(quotation.discountValue);
    const discountLabel = quotation.discountType === "percentage"
      ? `Discount (${Number(quotation.discountValue)}%)`
      : "Discount";
    doc.setTextColor(220, 38, 38);
    doc.text(discountLabel, summaryX + 4, lineY);
    doc.text(`- ${formatCurrency(discountAmt)}`, summaryX + summaryWidth - 4, lineY, { align: "right" });
  }

  // GST lines — one per rate, grouped and sorted ascending.
  for (const { rate, tax } of gstLines) {
    lineY += 7;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text(`GST @ ${rate}%`, summaryX + 4, lineY);
    doc.setTextColor(59, 130, 246);
    doc.text(`+ ${formatCurrency(tax)}`, summaryX + summaryWidth - 4, lineY, { align: "right" });
  }

  if (hasDeliveryCostLine) {
    lineY += 7;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("Delivery Cost", summaryX + 4, lineY);
    doc.setTextColor(...COLORS.textPrimary);
    doc.text(formatCurrency(deliveryCost), summaryX + summaryWidth - 4, lineY, { align: "right" });
  }

  lineY += 3;
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(summaryX + 4, lineY, summaryX + summaryWidth - 4, lineY);

  lineY += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text("Net Total (incl. GST)", summaryX + 4, lineY);
  doc.text(formatCurrency(quotation.totalAmount), summaryX + summaryWidth - 4, lineY, { align: "right" });

  y += summaryBoxH;

  // "Prices exclusive of GST" note (per spec fix 2c default)
  if (gstLines.length > 0) {
    y += 3;
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(148, 163, 184);
    doc.text("* Prices shown are exclusive of GST. GST will be charged as applicable.", summaryX + 4, y);
    doc.setFont("helvetica", "normal");
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
  doc.text("3. All unit prices are exclusive of GST. Applicable GST is shown separately in the totals.", margin, termsY + 18);

  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text("This is a system-generated quotation and does not require a signature.", pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });

  doc.save(`${quotation.quoteNumber}.pdf`);
}
