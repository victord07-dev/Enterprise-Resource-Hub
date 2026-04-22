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

function fmt(val: number | string): string {
  return `Rs. ${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number) {
  doc.roundedRect(x, y, w, h, r, r, "F");
}

/** Phase 7 — bundleItemsMap: bundle product id → list of components (name + qty + unit).
 *  Components' individual GST rates are NOT shown on customer-facing PDFs. */
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

  // ── Header ──────────────────────────────────────────────────────────────────
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

  // ── Meta / Customer box ──────────────────────────────────────────────────────
  const hasDelivery = (quotation as any).deliveryMethod === "delivery";
  const deliveryCost = hasDelivery && (quotation as any).deliveryCost
    ? Number((quotation as any).deliveryCost)
    : 0;
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

  // ── Pre-compute all-in display amounts ───────────────────────────────────────
  // Section A6: stored math is UNCHANGED. This is display-only in the PDF renderer.
  // displayTotal[i] = lineSubtotal × (1 + gstRate/100) + deliveryCost × (lineSubtotal / ΣlineSubtotals)
  // displayRate[i]  = displayTotal[i] / qty
  // A8: after computing all lines, add the rounding delta to the LAST line so Σ ties to grandTotal.
  const sumAllLinesSubtotal = items.reduce((acc, it) => acc + Number(it.totalPrice), 0);

  const displayAmounts = items.map(item => {
    const lineSubtotal = Number(item.totalPrice);
    const gstRate = Number((item as any).gstRate || 0);
    const qty = Number(item.quantity) || 1;
    const deliveryAlloc = sumAllLinesSubtotal > 0
      ? deliveryCost * (lineSubtotal / sumAllLinesSubtotal)
      : 0;
    const rawTotal = lineSubtotal * (1 + gstRate / 100) + deliveryAlloc;
    return { rawTotal, qty };
  });

  // Rounding delta adjustment on last line (A8).
  const grandTotal = Number(quotation.totalAmount);
  const sumRawTotals = displayAmounts.reduce((a, d) => a + d.rawTotal, 0);
  const roundingDelta = grandTotal - Math.round(sumRawTotals * 100) / 100;

  const displayTotals = displayAmounts.map((d, idx) => {
    let total = Math.round(d.rawTotal * 100) / 100;
    if (idx === displayAmounts.length - 1) total = Math.round((total + roundingDelta) * 100) / 100;
    return { displayTotal: total, displayRate: total / (d.qty || 1) };
  });

  // ── Table columns ─────────────────────────────────────────────────────────────
  const colX = {
    no:   margin,
    type: margin + 10,
    desc: margin + 30,
    qty:  margin + 115,
    rate: margin + 150,
    total: pageWidth - margin,
  };
  const tableHeaderH = 8;

  doc.setFillColor(...COLORS.tableHeader);
  drawRoundedRect(doc, margin, y, contentWidth, tableHeaderH, 1);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("#",           colX.no + 2,    y + 5.5);
  doc.text("Type",        colX.type,      y + 5.5);
  doc.text("Description", colX.desc,      y + 5.5);
  doc.text("Qty",         colX.qty,       y + 5.5, { align: "right" });
  doc.text("Rate",        colX.rate,      y + 5.5, { align: "right" });
  doc.text("Amount",      colX.total - 2, y + 5.5, { align: "right" });

  y += tableHeaderH;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  // ── Line items ────────────────────────────────────────────────────────────────
  items.forEach((item, idx) => {
    const prod = products?.find(p => p.id === item.productId);
    const warranty = prod?.warrantyPeriod && String(prod.warrantyPeriod).trim()
      ? String(prod.warrantyPeriod).trim()
      : null;
    const isBundle = prod?.type === "bundle";
    const bundleComps = isBundle && item.productId
      ? (bundleItemsMap?.[item.productId] ?? [])
      : [];
    // bundle sub-lines: each comp row = 4mm (no footnote needed — A5 removed it)
    const bundleSubH = isBundle ? (bundleComps.length * 4) : 0;
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

    // All-in display rate and total (A2, A6)
    const { displayTotal, displayRate } = displayTotals[idx];
    doc.text(fmt(displayRate), colX.rate, y + 5, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(fmt(displayTotal), colX.total - 2, y + 5, { align: "right" });
    doc.setFont("helvetica", "normal");

    if (warranty) {
      doc.setFontSize(6);
      doc.setTextColor(...COLORS.textSecondary);
      doc.text(`Warranty: ${warranty}`, colX.desc, y + 10);
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.textPrimary);
    }

    // A5: bundle component sub-lines — name + qty + unit ONLY. No prices, no GST, no footnote.
    if (isBundle && bundleComps.length > 0) {
      const baseY = y + (warranty ? 12 : 7);
      doc.setFontSize(6.5);
      doc.setTextColor(...COLORS.textSecondary);
      bundleComps.forEach((comp, ci) => {
        const subY = baseY + ci * 4 + 2;
        const totalQty = Number(comp.quantity) * Number(item.quantity || 1);
        doc.text(`> ${comp.name}`, colX.desc + 2, subY);
        doc.text(`${totalQty} ${comp.unit}`, colX.qty, subY, { align: "right" });
      });
      doc.setTextColor(...COLORS.textPrimary);
      doc.setFontSize(8);
    }

    y += rowH;
  });

  y += 4;

  // ── Totals block — single "Total" row (A3) ────────────────────────────────────
  // Discount is applied at the order level; the stored grandTotal already reflects
  // any discount. We surface discount visually if it was set, for transparency.
  const summaryX = pageWidth - margin - 80;
  const summaryWidth = 80;
  const hasDiscount = quotation.discountType && quotation.discountValue && Number(quotation.discountValue) > 0;

  const summaryBoxH = (hasDiscount ? 7 : 0) + 14; // discount row (optional) + total row
  doc.setFillColor(248, 250, 252);
  drawRoundedRect(doc, summaryX, y, summaryWidth, summaryBoxH, 2);

  let lineY = y + 6;

  if (hasDiscount) {
    const discountAmt = quotation.discountType === "percentage"
      ? sumAllLinesSubtotal * Number(quotation.discountValue) / 100
      : Number(quotation.discountValue);
    const discountLabel = quotation.discountType === "percentage"
      ? `Discount (${Number(quotation.discountValue)}%)`
      : "Discount";
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(220, 38, 38);
    doc.text(discountLabel, summaryX + 4, lineY);
    doc.text(`- ${fmt(discountAmt)}`, summaryX + summaryWidth - 4, lineY, { align: "right" });
    lineY += 7;
  }

  // Divider above total
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(summaryX + 4, lineY - 2, summaryX + summaryWidth - 4, lineY - 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text("Total", summaryX + 4, lineY + 4);
  doc.text(fmt(grandTotal), summaryX + summaryWidth - 4, lineY + 4, { align: "right" });

  y += summaryBoxH + 4;

  // A4: Prominent centered italic footnote "** All above items Including GST **"
  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bolditalic");
  doc.setTextColor(...COLORS.textPrimary);
  doc.text("** All above items Including GST **", pageWidth / 2, y, { align: "center" });
  doc.setFont("helvetica", "normal");

  // ── Notes ─────────────────────────────────────────────────────────────────────
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

  // ── Terms ──────────────────────────────────────────────────────────────────────
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
  doc.text("3. Rates are inclusive of applicable GST and a proportional share of delivery cost.", margin, termsY + 18);

  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "This is a system-generated quotation and does not require a signature.",
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 8,
    { align: "center" }
  );

  doc.save(`${quotation.quoteNumber}.pdf`);
}
