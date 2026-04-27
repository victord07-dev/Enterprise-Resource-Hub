import jsPDF from "jspdf";
import type { Quotation, QuotationItem, Customer, Product } from "@shared/schema";

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

const COMPANY = {
  name:    "IT Futuristic Industries Pvt. Ltd.",
  gstin:   "18AAICI6408B1ZR",
  email:   "admin@itfi.co.in",
  website: "www.itfi.co.in",
  address: "Dag No: 471, Patta Number: 250, Goroimaria Pathar Aibheti, Nagaon: 782002, Assam",
};

const BANKING = [
  {
    bank:   "HDFC Bank",
    holder: "M/S IT FUTURISTIC INDUSTRIES PVT. LTD.",
    branch: "Haibargaon, Nagaon",
    acNo:   "99999365647772",
    ifsc:   "HDFC0002036",
  },
  {
    bank:   "State Bank of India",
    holder: "M/S IT FUTURISTIC INDUSTRIES PVT. LTD.",
    branch: "Nagaon",
    acNo:   "44833748463",
    ifsc:   "SBIN0000146",
  },
];

const TERMS = [
  "All prices are inclusive of 5% GST.",
  "100% advance payment required before supply or work commencement. Accepted modes: NEFT / RTGS / UPI / Account Payee Cheque only. Work begins only on fund realisation.",
  "Materials will be delivered and installed at our cost.",
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

export function generateQuotationPDF(
  quotation: Quotation,
  items: QuotationItem[],
  customer: Customer | undefined,
  products?: Product[],
  bundleItemsMap?: Record<string, BundlePdfComponent[]>,
  logoDataUrl?: string,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin       = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  // ── Header — navy band ────────────────────────────────────────────────────────
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, pageWidth, 34, "F");

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin, 3.5, 58, 13);
    } catch {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...COLORS.headerText);
      doc.text(COMPANY.name, margin, 13);
    }
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...COLORS.headerText);
    doc.text(COMPANY.name, margin, 13);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(180, 190, 210);
  doc.text(`GSTIN: ${COMPANY.gstin}`, pageWidth - margin, 10, { align: "right" });
  doc.text(COMPANY.email,   pageWidth - margin, 16, { align: "right" });
  doc.text(COMPANY.website, pageWidth - margin, 21, { align: "right" });

  // Blue QUOTATION banner
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, 34, pageWidth, 13, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.white);
  doc.text("QUOTATION", pageWidth / 2, 42, { align: "center" });

  // Address strip
  doc.setFillColor(241, 245, 249);
  doc.rect(0, 47, pageWidth, 7, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text(COMPANY.address, pageWidth / 2, 52, { align: "center" });

  y = 60;

  // ── Meta / Customer box ───────────────────────────────────────────────────────
  const hasDelivery = (quotation as any).deliveryMethod === "delivery";
  const deliveryCost = hasDelivery && (quotation as any).deliveryCost
    ? Number((quotation as any).deliveryCost) : 0;
  const detailsBoxHeight = hasDelivery ? 36 : 28;

  doc.setFillColor(...COLORS.infoBg);
  drawRoundedRect(doc, margin, y, contentWidth, detailsBoxHeight, 2);

  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Quote Number",      margin + 4,  y + 6);
  doc.text("Date",              margin + 50, y + 6);
  doc.text("Valid Until",       margin + 85, y + 6);
  doc.text("Expected Delivery", margin + 120, y + 6);

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFont("helvetica", "bold");
  doc.text(quotation.quoteNumber, margin + 4, y + 12);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(quotation.createdAt).toLocaleDateString("en-IN"), margin + 50, y + 12);
  doc.text(quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString("en-IN") : "—", margin + 85, y + 12);
  doc.text(quotation.expectedDeliveryDate ? new Date(quotation.expectedDeliveryDate).toLocaleDateString("en-IN") : "—", margin + 120, y + 12);

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
    doc.setTextColor(...COLORS.accent);
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
    const isBundle   = prod?.type === "bundle";
    const bundleComps = isBundle && item.productId
      ? (bundleItemsMap?.[item.productId] ?? []) : [];
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
        const subY    = baseY + ci * 4 + 2;
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
  const hasDiscount  = quotation.discountType && quotation.discountValue && Number(quotation.discountValue) > 0;
  const summaryBoxH  = (hasDiscount ? 7 : 0) + 14;

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

  // ── Terms, Banking & Signature ─────────────────────────────────────────────────
  // Pre-compute height needed for the footer block
  const termLineH  = 3.4; // mm per wrapped line
  const termLines  = TERMS.map(t => doc.splitTextToSize(`${TERMS.indexOf(t) + 1}. ${t}`, contentWidth));
  const termsBlockH = 8 + termLines.reduce((s, ls) => s + ls.length * termLineH + 1.5, 0);
  const bankBlockH  = 8 + 26;
  const sigH        = 18;
  const footerH     = termsBlockH + bankBlockH + sigH + 8; // +8 for gaps

  if (pageHeight - y < footerH + 10) {
    doc.addPage();
    y = 20;
  } else {
    y += 10;
  }

  // Terms section
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
    // page break mid-terms
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

  // Banking section
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("BANKING DETAILS", margin, y);
  y += 5;

  const bankColW = (contentWidth - 8) / BANKING.length;
  BANKING.forEach((bank, bi) => {
    const bx = margin + bi * (bankColW + 8);
    doc.setFillColor(...COLORS.infoBg);
    drawRoundedRect(doc, bx, y, bankColW, 22, 2);

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
    doc.text(bank.branch, bx + bankColW - 4, y + 13.5, { align: "right" });
    doc.text(bank.acNo,   bx + bankColW - 4, y + 17,   { align: "right" });
    doc.text(bank.ifsc,   bx + bankColW - 4, y + 20.5, { align: "right" });
  });

  y += 26;

  // Authorised Signature
  const sigX = pageWidth - margin - 65;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("For IT Futuristic Industries Pvt. Ltd.", sigX, y);
  y += 12;
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(sigX, y, pageWidth - margin, y);
  y += 4;
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Authorised Signature", pageWidth - margin, y, { align: "right" });

  // System note
  doc.setFontSize(6);
  doc.setTextColor(180, 190, 210);
  doc.text(
    "This is a system-generated quotation — IT Futuristic Industries Pvt. Ltd.",
    pageWidth / 2,
    pageHeight - 5,
    { align: "center" }
  );

  doc.save(`${quotation.quoteNumber}.pdf`);
}
