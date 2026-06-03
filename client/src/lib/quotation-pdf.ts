// Dynamic import — jsPDF only loads when the user clicks "Download PDF".
import type jsPDF from "jspdf";
import type { Quotation, QuotationItem, Customer, Product } from "@shared/schema";

async function loadJsPDF() {
  const mod = await import("jspdf");
  return mod.default || (mod as any).jsPDF;
}
import { COMPANY, BANKING } from "@shared/letterhead";
import { drawLetterhead } from "@shared/pdf-letterhead";
import { ensureNotoSansRegistered } from "@/lib/pdf-fonts";
import QRCode from "qrcode";

const COLORS = {
  headerBg:      [30, 41, 59]   as [number, number, number],
  headerText:    [255, 255, 255] as [number, number, number],
  accent:        [59, 130, 246]  as [number, number, number],
  textPrimary:   [15, 23, 42]   as [number, number, number],
  textSecondary: [100, 116, 139] as [number, number, number],
  tableBorder:   [226, 232, 240] as [number, number, number],
  tableHeader:   [241, 245, 249] as [number, number, number],
  white:         [255, 255, 255] as [number, number, number],
  infoBg:        [248, 250, 252] as [number, number, number],
};

const TERMS = [
  "All prices are inclusive of taxes as per HSN Code.",
  "If the order is under PM Surya Ghar scheme under our vendor then we bear the installation & delivery cost.",
  "Vendor/Customer delivery will be at your cost.",
  "Delivery is within Nagaon, Assam limits only. Freight, loading & transportation outside city limits are charged extra at actuals.",
  "Site must be ready before scheduled visit. Revisit charges apply if our team cannot proceed due to site unreadiness. Engineers' travel, food & lodging for sites outside Nagaon, Assam are under the buyer's scope.",
  "Warranty on materials is as per respective manufacturer's terms. Warranty is void for misuse, unauthorised modifications, or power fluctuations.",
  "Orders once confirmed and materials procured cannot be cancelled. Cancellation costs will be recovered from the buyer.",
  "All disputes subject to jurisdiction of Nagaon Courts, Assam. Placing an order or making payment constitutes acceptance of these terms.",
];

function fmt(val: number | string): string {
  return `Rs. ${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number) {
  doc.roundedRect(x, y, w, h, r, r, "F");
}

/** Phase 7 — bundleItemsMap: bundle product id → list of components (name + qty + unit). */
export type BundlePdfComponent = { name: string; quantity: number; unit: string; gstRate: number };

export async function generateQuotationPDF(
  quotation: Quotation,
  items: QuotationItem[],
  customer: Customer | undefined,
  products?: Product[],
  bundleItemsMap?: Record<string, BundlePdfComponent[]>,
  logoDataUrl?: string,
) {
  const doc = new (await loadJsPDF())({ orientation: "portrait", unit: "mm", format: "a4" });
  await ensureNotoSansRegistered(doc);
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin       = 15;
  const contentWidth = pageWidth - margin * 2;

  // Phase 4C P6-EXT — canonical letterhead (returns body-start y = 43)
  let y = drawLetterhead(doc, {
    pageWidth,
    margin,
    title: "QUOTATION",
    logoDataUrl,
  });

  // ── Meta / Customer box ───────────────────────────────────────────────────────
  const hasDelivery = (quotation as any).deliveryMethod === "delivery";
  const deliveryCost = hasDelivery && (quotation as any).deliveryCost
    ? Number((quotation as any).deliveryCost) : 0;

  // Compute customer address lines count for dynamic box height
  const custAddrLines = customer?.address
    ? doc.splitTextToSize(customer.address, contentWidth / 2 - 8)
    : [];
  const custDetailRows = [
    customer?.phone,
    customer?.email,
    customer?.gstNumber ? `GST: ${customer.gstNumber}` : null,
  ].filter(Boolean);
  const customerSectionH = customer
    ? 7 + 6 + (custDetailRows.length > 0 ? 5 : 0) + (custAddrLines.length > 0 ? custAddrLines.length * 3.5 : 0)
    : 0;
  const deliveryRowH = hasDelivery ? 10 : 0;
  const detailsBoxHeight = Math.max(28, 14 + customerSectionH + deliveryRowH);

  doc.setFillColor(...COLORS.infoBg);
  drawRoundedRect(doc, margin, y, contentWidth, detailsBoxHeight, 2);

  // 4-column header row — evenly spaced
  const colStep = contentWidth / 4;
  const c1 = margin + 4;
  const c2 = margin + colStep + 4;
  const c3 = margin + colStep * 2 + 4;
  const c4 = margin + colStep * 3 + 4;

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Quote Number",      c1, y + 6);
  doc.text("Date",              c2, y + 6);
  doc.text("Valid Until",       c3, y + 6);
  doc.text("Expected Delivery", c4, y + 6);

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFont("helvetica", "bold");
  doc.text(quotation.quoteNumber, c1, y + 12);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(quotation.createdAt).toLocaleDateString("en-IN"), c2, y + 12);
  doc.text(
    quotation.validUntil
      ? new Date(quotation.validUntil).toLocaleDateString("en-IN")
      : "—",
    c3, y + 12,
  );
  doc.text(
    quotation.expectedDeliveryDate
      ? new Date(quotation.expectedDeliveryDate).toLocaleDateString("en-IN")
      : "—",
    c4, y + 12,
  );

  // Divider under header row
  const divY = y + 14.5;
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(margin + 2, divY, margin + contentWidth - 2, divY);

  // Bill To — two-column layout
  if (customer) {
    const leftX  = margin + 4;
    const rightX = margin + contentWidth / 2 + 4;
    let rowY = divY + 5;

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("Bill To", leftX, rowY);
    rowY += 5;

    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textPrimary);
    doc.setFont("helvetica", "bold");
    doc.text(customer.name, leftX, rowY);
    doc.setFont("helvetica", "normal");
    rowY += 5;

    if (custDetailRows.length > 0) {
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.textSecondary);
      doc.text(custDetailRows.join("  |  "), leftX, rowY);
      rowY += 4.5;
    }

    if (custAddrLines.length > 0) {
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.textSecondary);
      doc.text(custAddrLines, leftX, rowY);
    }
  }

  if (hasDelivery) {
    const delivRowY = y + detailsBoxHeight - deliveryRowH + 3;
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("Delivery Method:", margin + 4, delivRowY);
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.accent);
    doc.setFont("helvetica", "bold");
    doc.text("Delivery", margin + 40, delivRowY);
    doc.setFont("helvetica", "normal");
    if ((quotation as any).deliveryAddress) {
      doc.setFontSize(6.5);
      doc.setTextColor(...COLORS.textSecondary);
      doc.text("Deliver To:", margin + 60, delivRowY);
      doc.setTextColor(...COLORS.textPrimary);
      const addrText = doc.splitTextToSize((quotation as any).deliveryAddress, 70);
      doc.text(addrText[0] || "", margin + 80, delivRowY);
    }
  }

  y += detailsBoxHeight + 6;

  // ── Pre-compute all-in display amounts ────────────────────────────────────────
  const sumAllLinesSubtotal = items.reduce((acc, it) => acc + Number(it.totalPrice), 0);

  const displayAmounts = items.map(item => {
    const lineSubtotal = Number(item.totalPrice);
    const gstRate      = Number((item as any).gstRate || 0);
    const qty          = Number(item.quantity) || 1;
    const deliveryAlloc = sumAllLinesSubtotal > 0
      ? deliveryCost * (lineSubtotal / sumAllLinesSubtotal) : 0;
    const rawTotal = lineSubtotal * (1 + gstRate / 100) + deliveryAlloc;
    return { rawTotal, qty };
  });

  const grandTotal   = Number(quotation.totalAmount);
  const sumRawTotals = displayAmounts.reduce((a, d) => a + d.rawTotal, 0);
  const roundingDelta = grandTotal - Math.round(sumRawTotals * 100) / 100;

  const displayTotals = displayAmounts.map((d, idx) => {
    let total = Math.round(d.rawTotal * 100) / 100;
    if (idx === displayAmounts.length - 1) total = Math.round((total + roundingDelta) * 100) / 100;
    return { displayTotal: total, displayRate: total / (d.qty || 1) };
  });

  // ── Table header ──────────────────────────────────────────────────────────────
  const colX = {
    no:    margin,
    type:  margin + 10,
    desc:  margin + 30,
    qty:   margin + 115,
    rate:  margin + 150,
    total: pageWidth - margin,
  };
  const tableHeaderH = 8;

  doc.setFillColor(...COLORS.tableHeader);
  drawRoundedRect(doc, margin, y, contentWidth, tableHeaderH, 1);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("#",           colX.no + 2,        y + 5.5);
  doc.text("Type",        colX.type,          y + 5.5);
  doc.text("Description", colX.desc,          y + 5.5);
  doc.text("Qty",         colX.qty,           y + 5.5, { align: "right" });
  doc.text("Rate",        colX.rate,          y + 5.5, { align: "right" });
  doc.text("Amount",      colX.total - 2,     y + 5.5, { align: "right" });

  y += tableHeaderH;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  // ── Line items ────────────────────────────────────────────────────────────────
  items.forEach((item, idx) => {
    const prod     = products?.find(p => p.id === item.productId);
    const warranty = prod?.warrantyPeriod && String(prod.warrantyPeriod).trim()
      ? String(prod.warrantyPeriod).trim() : null;
    const isBundle    = prod?.type === "bundle";
    // Phase 98: per-item custom components (keyed by item.id) take priority over master bundle (keyed by productId)
    const bundleComps = isBundle && item.productId
      ? (bundleItemsMap?.[item.id] ?? bundleItemsMap?.[item.productId] ?? []) : [];
    const bundleSubH = isBundle ? (bundleComps.length * 4) : 0;
    const rowH = (warranty ? 12 : 7) + bundleSubH;

    const maxPageY = pageHeight - 40;
    if (y + rowH > maxPageY) { doc.addPage(); y = 20; }

    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, rowH, "F");
    }
    doc.setDrawColor(...COLORS.tableBorder);
    doc.line(margin, y + rowH, pageWidth - margin, y + rowH);

    doc.setTextColor(...COLORS.textPrimary);
    doc.text(String(idx + 1), colX.no + 2, y + 5);

    const typeLabel = isBundle ? "Bundle" : (item.itemType === "service" ? "Service" : "Product");
    const [tR, tG, tB] = isBundle ? [109, 40, 217]
      : item.itemType === "service" ? [234, 88, 12] : [59, 130, 246];
    doc.setTextColor(tR, tG, tB);
    doc.text(typeLabel, colX.type, y + 5);

    doc.setTextColor(...COLORS.textPrimary);
    const descText = doc.splitTextToSize(item.description || "—", 80);
    doc.text(descText[0], colX.desc, y + 5);
    doc.text(String(item.quantity), colX.qty, y + 5, { align: "right" });

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

    if (isBundle && bundleComps.length > 0) {
      const baseY = y + (warranty ? 12 : 7);
      doc.setFontSize(6.5);
      doc.setTextColor(...COLORS.textSecondary);
      bundleComps.forEach((comp, ci) => {
        const subY     = baseY + ci * 4 + 2;
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

  // ── Summary / Totals ──────────────────────────────────────────────────────────
  const summaryX     = pageWidth - margin - 80;
  const summaryWidth = 80;
  const hasDiscount   = quotation.discountType && quotation.discountValue && Number(quotation.discountValue) > 0;
  const hasRounding   = (quotation as any).applyRounding && Number((quotation as any).roundingAmount ?? 0) !== 0;
  const summaryBoxH   = (hasDiscount ? 7 : 0) + (hasRounding ? 7 : 0) + 14;

  doc.setFillColor(...COLORS.infoBg);
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
  if (hasRounding) {
    const roundingAmt = Number((quotation as any).roundingAmount);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("Rounding", summaryX + 4, lineY);
    doc.text(`${roundingAmt > 0 ? "+" : ""}${fmt(Math.abs(roundingAmt))}`, summaryX + summaryWidth - 4, lineY, { align: "right" });
    lineY += 7;
  }

  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(summaryX + 4, lineY - 2, summaryX + summaryWidth - 4, lineY - 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text("Total", summaryX + 4, lineY + 4);
  doc.text(fmt(grandTotal), summaryX + summaryWidth - 4, lineY + 4, { align: "right" });

  y += summaryBoxH + 4;

  // GST footnote
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

  // ── Banking, Terms & Signature ────────────────────────────────────────────────
  // Pre-compute footer height (banking first, then terms, then signature)
  const termLineH   = 3.4;
  const termLines   = TERMS.map(t => doc.splitTextToSize(`${TERMS.indexOf(t) + 1}. ${t}`, contentWidth));
  const termsBlockH = 8 + termLines.reduce((s, ls) => s + ls.length * termLineH + 1.5, 0);
  const bankBlockH  = 8 + 44;
  const sigH        = 18;
  const footerH     = bankBlockH + termsBlockH + sigH + 8;

  if (pageHeight - y < footerH + 10) {
    doc.addPage();
    y = 20;
  } else {
    y += 10;
  }

  // ── Banking section (above Terms) ────────────────────────────────────────────
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("BANKING DETAILS", margin, y);
  y += 5;

  // QR width reserved on right side
  const qrSize = 34;
  const qrBankColW = (contentWidth - 8 - qrSize - 6) / BANKING.length;
  BANKING.forEach((bank, bi) => {
    const bx = margin + bi * (qrBankColW + 8);
    doc.setFillColor(...COLORS.infoBg);
    drawRoundedRect(doc, bx, y, qrBankColW, 22, 2);

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.textPrimary);
    doc.text(bank.bank, bx + 4, y + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.textSecondary);
    doc.text(bank.holder, bx + 4, y + 9.5);

    doc.setFontSize(7);
    doc.text("Branch",      bx + 4, y + 13.5);
    doc.text("Account No.", bx + 4, y + 17);
    doc.text("IFSC Code",   bx + 4, y + 20.5);

    doc.setTextColor(...COLORS.textPrimary);
    doc.text(bank.branch, bx + qrBankColW - 4, y + 13.5, { align: "right" });
    doc.text(bank.acNo,   bx + qrBankColW - 4, y + 17,   { align: "right" });
    doc.text(bank.ifsc,   bx + qrBankColW - 4, y + 20.5, { align: "right" });
  });

  // UPI QR code box on the right
  const upiBank = (BANKING as any[]).find((b: any) => b.upiId);
  if (upiBank?.upiId) {
    try {
      const upiString = `upi://pay?pa=${upiBank.upiId}&pn=${encodeURIComponent(upiBank.holder)}&cu=INR`;
      const qrDataUrl = await QRCode.toDataURL(upiString, { width: 120, margin: 1 });
      const qrX = pageWidth - margin - qrSize;
      const boxH = qrSize + 9; // QR image + label below
      doc.setFillColor(...COLORS.infoBg);
      drawRoundedRect(doc, qrX - 2, y, qrSize + 2, boxH, 2);
      doc.addImage(qrDataUrl, "PNG", qrX, y + 1, qrSize - 2, qrSize - 2);
      // Labels sit BELOW the QR image, inside the box
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.textSecondary);
      doc.text("SCAN & PAY", qrX + (qrSize - 2) / 2 - 1, y + qrSize + 2, { align: "center" });
      doc.setFontSize(5);
      doc.setFont("helvetica", "normal");
      doc.text(upiBank.upiId, qrX + (qrSize - 2) / 2 - 1, y + qrSize + 6, { align: "center" });
    } catch { /* QR generation failed — skip silently */ }
  }

  y += 44;

  // ── Terms section ─────────────────────────────────────────────────────────────
  y += 4;
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("TERMS & CONDITIONS", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  TERMS.forEach((term, idx) => {
    const wrapped = doc.splitTextToSize(`${idx + 1}. ${term}`, contentWidth);
    if (y + wrapped.length * termLineH > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(wrapped, margin, y);
    y += wrapped.length * termLineH + 1.5;
  });

  y += 4;

  // ── Authorised Signature ──────────────────────────────────────────────────────
  const sigX = pageWidth - margin - 65;
  y += 8;
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(sigX, y, pageWidth - margin, y);
  y += 4;
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Authorised Signature", pageWidth - margin, y, { align: "right" });

  // System note
  doc.setFontSize(6);
  doc.setTextColor(180, 190, 210);
  doc.text(
    "This is a system-generated quotation — M/s Hussain Enterprise",
    pageWidth / 2,
    pageHeight - 5,
    { align: "center" }
  );

  doc.save(`${quotation.quoteNumber}.pdf`);
}
