import jsPDF from "jspdf";
import type { PurchaseOrder, PurchaseOrderItem, Supplier, Product } from "@shared/schema";

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
  draftRed:      [220, 38, 38]   as [number, number, number],
  cancelRed:     [185, 28, 28]   as [number, number, number],
};

const COMPANY = {
  name:    "IT Futuristic Industries Pvt. Ltd.",
  gstin:   "18AAICI6408B1ZR",
  phone:   "+91 80115 35537",
  email:   "info@itfi.co.in",
  website: "www.itfi.co.in",
  address: "Dag No: 471, Patta Number: 250, Goroimaria Pathar Aibheti, Nagaon: 782002, Assam",
};

const SHIP_TO = "IT Futuristic Industries Pvt. Ltd.\nDag No: 471, Goroimaria Pathar Aibheti\nNagaon — 782002, Assam\nGSTIN: 18AAICI6408B1ZR";

const SIGNATORY = {
  name:        "Authorised Signatory",
  designation: "For IT Futuristic Industries Pvt. Ltd.",
};

const PO_TERMS = [
  "Payment terms as agreed. Goods to be delivered to specified address. Quality and quantity must match this PO.",
  "Delivery must be made by the expected delivery date unless agreed otherwise in writing.",
  "All goods must meet agreed quality standards and specifications; defective goods will be returned at supplier's cost.",
  "This PO constitutes a binding purchase commitment upon supplier acknowledgement.",
];

function fmt(val: number | string): string {
  return `\u20B9${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill = "F") {
  doc.roundedRect(x, y, w, h, r, r, fill);
}

function buildPdf(
  po: PurchaseOrder,
  items: PurchaseOrderItem[],
  supplier: Supplier | undefined,
  products?: Product[],
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin       = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const productMap = new Map<string, Product>();
  (products ?? []).forEach(p => productMap.set(p.id, p));

  // ── Header — navy band ────────────────────────────────────────────────────────
  const headerH = 30;
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, pageWidth, headerH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.headerText);
  doc.text(COMPANY.name, margin, headerH / 2 - 2);

  const rx = pageWidth - margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(220, 230, 248);
  doc.text(COMPANY.name, rx, 5.5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(180, 190, 210);
  const addrL = doc.splitTextToSize(COMPANY.address, 85);
  doc.text(addrL[0], rx, 9.5, { align: "right" });

  doc.setFontSize(6);
  doc.text(`Phone: ${COMPANY.phone}`, rx, 14, { align: "right" });
  doc.text(COMPANY.email,             rx, 18, { align: "right" });
  doc.text(COMPANY.website,           rx, 22, { align: "right" });
  doc.text(`GSTIN: ${COMPANY.gstin}`, rx, 26, { align: "right" });

  // Blue PURCHASE ORDER banner
  const bannerY = headerH;
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, bannerY, pageWidth, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.white);
  doc.text("PURCHASE ORDER", pageWidth / 2, bannerY + 5.5, { align: "center" });

  y = bannerY + 8 + 5;

  // ── Meta box (PO# / Date / Expected Delivery / Status) ────────────────────────
  const metaBoxH = 22;
  doc.setFillColor(...COLORS.infoBg);
  drawRoundedRect(doc, margin, y, contentWidth, metaBoxH, 2);

  const colStep = contentWidth / 4;
  const c1 = margin + 4, c2 = margin + colStep + 4, c3 = margin + colStep * 2 + 4, c4 = margin + colStep * 3 + 4;

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("PO Number",           c1, y + 6);
  doc.text("Order Date",          c2, y + 6);
  doc.text("Expected Delivery",   c3, y + 6);
  doc.text("Status",              c4, y + 6);

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFont("helvetica", "bold");
  doc.text(po.poNumber, c1, y + 13);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(po.orderDate).toLocaleDateString("en-IN"),  c2, y + 13);
  doc.text(po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString("en-IN") : "—", c3, y + 13);
  const statusLabel = po.status.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  doc.setTextColor(...COLORS.accent);
  doc.text(statusLabel, c4, y + 13);

  y += metaBoxH + 5;

  // ── Supplier (TO) + Ship-To (DELIVER TO) — two-column ────────────────────────
  const partyBoxH = supplier ? Math.max(36, 10 + (supplier.address ? doc.splitTextToSize(supplier.address, contentWidth / 2 - 10).length * 3.5 : 0) + 22) : 20;
  doc.setFillColor(...COLORS.infoBg);
  drawRoundedRect(doc, margin, y, contentWidth, partyBoxH, 2);

  const half = contentWidth / 2;
  const leftX = margin + 4;
  const rightX = margin + half + 4;
  let lY = y + 6;

  // Supplier (left)
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("SUPPLIER (TO)", leftX, lY);
  lY += 5;
  if (supplier) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.textPrimary);
    doc.text(supplier.name, leftX, lY);
    lY += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textSecondary);
    if (supplier.contactPerson) { doc.text(supplier.contactPerson, leftX, lY); lY += 3.5; }
    if (supplier.phone) { doc.text(supplier.phone, leftX, lY); lY += 3.5; }
    if (supplier.email) { doc.text(supplier.email, leftX, lY); lY += 3.5; }
    if (supplier.gstNumber) { doc.text(`GSTIN: ${supplier.gstNumber}`, leftX, lY); lY += 3.5; }
    if (supplier.address) {
      const addrLines = doc.splitTextToSize(supplier.address, half - 10);
      doc.text(addrLines, leftX, lY);
    }
  } else {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textPrimary);
    doc.text("—", leftX, lY);
  }

  // Ship-to (right)
  let rY = y + 6;
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("DELIVER TO (SHIP TO)", rightX, rY);
  rY += 5;
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.textPrimary);
  const shipLines = SHIP_TO.split("\n");
  shipLines.forEach((line, i) => {
    if (i === 0) doc.setFont("helvetica", "bold");
    else doc.setFont("helvetica", "normal");
    doc.text(line, rightX, rY);
    rY += 3.8;
  });

  y += partyBoxH + 5;

  // ── Pre-compute GST values per line ──────────────────────────────────────────
  type LineGst = {
    taxable: number;
    gstRate: number;
    gstAmt:  number;
    total:   number;
    hsn:     string;
    unit:    string;
    disc:    number;
  };

  const lineGsts: LineGst[] = items.map(item => {
    const prod = item.productId ? productMap.get(item.productId) : undefined;
    const unit      = prod?.unit ?? "pcs";
    const qty       = Number(item.quantity);
    const unitCost  = Number(item.unitCost);
    const disc      = 0;
    // H6: prefer snapshotted GST data on item; fall back to product catalog
    const gstRate   = (item as any).gstRate != null ? Number((item as any).gstRate) : (prod ? Number(prod.gstRate) : 0);
    const hsn       = (item as any).hsnCode ?? prod?.hsnCode ?? "";
    const taxable   = (item as any).taxableAmount != null ? Number((item as any).taxableAmount) : qty * unitCost * (1 - disc / 100);
    const gstAmt    = (item as any).gstAmount != null ? Number((item as any).gstAmount) : Math.round(taxable * gstRate) / 100;
    const total     = taxable + gstAmt;
    return { taxable, gstRate, gstAmt, total, hsn, unit, disc };
  });

  const grandTotal   = lineGsts.reduce((s, g) => s + g.total, 0);
  const totalTaxable = lineGsts.reduce((s, g) => s + g.taxable, 0);
  const totalGst     = lineGsts.reduce((s, g) => s + g.gstAmt, 0);

  // Group by GST rate for breakdown
  const gstGroups = new Map<number, { taxable: number; gst: number }>();
  lineGsts.forEach(g => {
    const prev = gstGroups.get(g.gstRate) ?? { taxable: 0, gst: 0 };
    gstGroups.set(g.gstRate, { taxable: prev.taxable + g.taxable, gst: prev.gst + g.gstAmt });
  });
  const multiRate = gstGroups.size > 1;

  // ── Table header ──────────────────────────────────────────────────────────────
  const col = {
    no:      margin,
    desc:    margin + 8,
    hsn:     margin + 82,
    qty:     margin + 104,
    uom:     margin + 116,
    rate:    margin + 130,
    disc:    margin + 145,
    taxable: margin + 157,
    gstPct:  margin + 167,
    gstAmt:  margin + 176,
    total:   pageWidth - margin,
  };
  const tableHeaderH = 9;

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - 40) { doc.addPage(); y = 20; }
  };

  checkPageBreak(tableHeaderH + 10);
  doc.setFillColor(...COLORS.tableHeader);
  drawRoundedRect(doc, margin, y, contentWidth, tableHeaderH, 1);
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("#",        col.no + 2,      y + 6);
  doc.text("Item Description", col.desc, y + 6);
  doc.text("HSN",      col.hsn,         y + 6);
  doc.text("Qty",      col.qty,         y + 6, { align: "right" });
  doc.text("UoM",      col.uom + 1,     y + 6);
  doc.text("Rate",     col.rate,        y + 6, { align: "right" });
  doc.text("Disc%",    col.disc,        y + 6, { align: "right" });
  doc.text("Taxable",  col.taxable,     y + 6, { align: "right" });
  doc.text("GST%",     col.gstPct + 1,  y + 6);
  doc.text("GST Amt",  col.gstAmt,      y + 6, { align: "right" });
  doc.text("Total",    col.total - 2,   y + 6, { align: "right" });

  y += tableHeaderH;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);

  // ── Line items ────────────────────────────────────────────────────────────────
  items.forEach((item, idx) => {
    const g = lineGsts[idx];
    const prod = item.productId ? productMap.get(item.productId) : undefined;
    const rowH = 7;
    checkPageBreak(rowH);

    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, rowH, "F");
    }
    doc.setDrawColor(...COLORS.tableBorder);
    doc.line(margin, y + rowH, pageWidth - margin, y + rowH);

    doc.setTextColor(...COLORS.textPrimary);
    doc.setFontSize(7);
    doc.text(String(idx + 1), col.no + 2, y + 5);

    const descText = doc.splitTextToSize(item.description || prod?.name || "—", 70);
    doc.text(descText[0], col.desc, y + 5);
    doc.text(g.hsn || "—",            col.hsn,    y + 5);
    doc.text(String(item.quantity),    col.qty,    y + 5, { align: "right" });
    doc.text(g.unit,                   col.uom + 1, y + 5);
    doc.text(fmt(item.unitCost),       col.rate,   y + 5, { align: "right" });
    doc.text("0%",                     col.disc,   y + 5, { align: "right" });
    doc.text(fmt(g.taxable),           col.taxable, y + 5, { align: "right" });
    doc.text(`${g.gstRate}%`,          col.gstPct + 1, y + 5);
    doc.text(fmt(g.gstAmt),            col.gstAmt, y + 5, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(fmt(g.total),             col.total - 2, y + 5, { align: "right" });
    doc.setFont("helvetica", "normal");

    y += rowH;
  });

  y += 5;

  // ── Totals / GST summary ──────────────────────────────────────────────────────
  const summaryX = pageWidth - margin - 90;
  const sumW     = 90;

  const summaryRows: Array<{ label: string; value: string; bold?: boolean; color?: [number,number,number] }> = [];

  summaryRows.push({ label: "Taxable Amount", value: fmt(totalTaxable) });

  if (multiRate) {
    Array.from(gstGroups.entries()).sort(([a],[b]) => a-b).forEach(([rate, { taxable, gst }]) => {
      summaryRows.push({ label: `  Taxable @ ${rate}%`, value: fmt(taxable), color: COLORS.textSecondary });
      summaryRows.push({ label: `  GST @ ${rate}%`,     value: fmt(gst),     color: COLORS.textSecondary });
    });
    summaryRows.push({ label: "Total GST", value: fmt(totalGst) });
  } else {
    const [rate] = gstGroups.keys();
    summaryRows.push({ label: `GST (${rate ?? 0}%)`, value: fmt(totalGst) });
  }

  if (po.notes || true) { /* always show subtotal row */ }
  summaryRows.push({ label: "Grand Total", value: fmt(grandTotal), bold: true });

  const rowH = 6;
  const summaryH = summaryRows.length * rowH + 4;
  checkPageBreak(summaryH + 20);

  doc.setFillColor(...COLORS.infoBg);
  drawRoundedRect(doc, summaryX, y, sumW, summaryH, 2);

  let sy = y + 5;
  summaryRows.forEach((row, i) => {
    const isGrand = row.bold;
    if (isGrand) {
      doc.setDrawColor(...COLORS.tableBorder);
      doc.line(summaryX + 4, sy - 2, summaryX + sumW - 4, sy - 2);
    }
    doc.setFontSize(isGrand ? 9 : 7.5);
    doc.setFont("helvetica", isGrand ? "bold" : "normal");
    doc.setTextColor(...(row.color ?? COLORS.textPrimary));
    doc.text(row.label, summaryX + 4, sy);
    doc.setFont("helvetica", isGrand ? "bold" : "normal");
    doc.text(row.value, summaryX + sumW - 4, sy, { align: "right" });
    sy += rowH;
  });

  y += summaryH + 6;

  // ── Notes ─────────────────────────────────────────────────────────────────────
  if (po.notes) {
    checkPageBreak(20);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("NOTES", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textPrimary);
    const noteLines = doc.splitTextToSize(po.notes, contentWidth - 10);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4 + 4;
  }

  // ── T&C ───────────────────────────────────────────────────────────────────────
  const termLineH = 3.4;
  const termsH = 8 + PO_TERMS.reduce((s, t) => s + doc.splitTextToSize(`• ${t}`, contentWidth).length * termLineH + 1.5, 0);
  checkPageBreak(termsH + 30);

  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("TERMS & CONDITIONS", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  PO_TERMS.forEach((term) => {
    const wrapped = doc.splitTextToSize(`• ${term}`, contentWidth);
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(wrapped, margin, y);
    y += wrapped.length * termLineH + 1.5;
  });

  y += 6;

  // ── Signature block ────────────────────────────────────────────────────────────
  checkPageBreak(22);
  const sigX = pageWidth - margin - 70;
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(sigX, y, pageWidth - margin, y);
  y += 4;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(SIGNATORY.designation, pageWidth - margin, y, { align: "right" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text(SIGNATORY.name, pageWidth - margin, y, { align: "right" });

  // ── System footer ─────────────────────────────────────────────────────────────
  doc.setFontSize(6);
  doc.setTextColor(180, 190, 210);
  doc.text(
    "System-generated Purchase Order — IT Futuristic Industries Pvt. Ltd.",
    pageWidth / 2, pageHeight - 5, { align: "center" }
  );

  // ── DRAFT / CANCELLED watermark ───────────────────────────────────────────────
  const watermarkStatus = po.status === "pending" ? "DRAFT" : po.status === "cancelled" ? "CANCELLED" : null;
  if (watermarkStatus) {
    const totalPages = (doc as any).internal.pages.length - 1;
    for (let pg = 1; pg <= Math.max(1, totalPages); pg++) {
      doc.setPage(pg);
      doc.saveGraphicsState();
      doc.setGState((doc as any).GState({ opacity: 0.12 }));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(72);
      doc.setTextColor(
        ...(watermarkStatus === "CANCELLED" ? COLORS.cancelRed : COLORS.draftRed)
      );
      doc.text(watermarkStatus, pageWidth / 2, pageHeight / 2, {
        align: "center",
        angle: 45,
      });
      doc.restoreGraphicsState();
    }
  }

  return doc;
}

/** Client-side download (kept for potential fallback use) */
export function generatePurchaseOrderPDF(
  po: PurchaseOrder,
  items: PurchaseOrderItem[],
  supplier: Supplier | undefined,
  products?: Product[],
) {
  const doc = buildPdf(po, items, supplier, products);
  doc.save(`${po.poNumber}.pdf`);
}

/** Returns base64 string for transmission / server-side use */
export function generatePurchaseOrderPDFBase64(
  po: PurchaseOrder,
  items: PurchaseOrderItem[],
  supplier: Supplier | undefined,
  products?: Product[],
): string {
  const doc = buildPdf(po, items, supplier, products);
  return doc.output("datauristring");
}
