/**
 * Server-side PO PDF generator.
 * Uses jsPDF (works in Node.js via arraybuffer output).
 * Returns a Buffer for streaming as application/pdf.
 */

import { jsPDF } from "jspdf";
import type { PurchaseOrder, PurchaseOrderItem, Supplier, Product } from "@shared/schema";
import { COMPANY, SHIP_TO, SIGNATORY } from "@shared/letterhead";

const COLORS = {
  headerBg:      [30, 41, 59]   as [number, number, number],
  accent:        [59, 130, 246]  as [number, number, number],
  textPrimary:   [15, 23, 42]   as [number, number, number],
  textSecondary: [100, 116, 139] as [number, number, number],
  tableBorder:   [226, 232, 240] as [number, number, number],
  tableHeader:   [241, 245, 249] as [number, number, number],
  white:         [255, 255, 255] as [number, number, number],
  infoBg:        [248, 250, 252] as [number, number, number],
};

const PO_TERMS = [
  "Payment terms as agreed. Goods to be delivered to specified address. Quality and quantity must match this PO.",
  "Delivery must be made by the expected delivery date unless agreed otherwise in writing.",
  "All goods must meet agreed quality standards and specifications; defective goods will be returned at supplier's cost.",
  "This PO constitutes a binding purchase commitment upon supplier acknowledgement.",
];

function fmtINR(val: number | string): string {
  return `Rs. ${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function drawRR(doc: any, x: number, y: number, w: number, h: number, r: number) {
  doc.roundedRect(x, y, w, h, r, r, "F");
}

export function generatePOPdfBuffer(
  po: PurchaseOrder,
  items: PurchaseOrderItem[],
  supplier: Supplier | undefined,
  products: Product[],
): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin       = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const productMap = new Map<string, Product>();
  products.forEach((p: Product) => productMap.set(p.id, p));

  // ── Header ────────────────────────────────────────────────────────────────────
  const headerH = 30;
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, pageWidth, headerH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
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

  const bannerY = headerH;
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, bannerY, pageWidth, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.white);
  doc.text("PURCHASE ORDER", pageWidth / 2, bannerY + 5.5, { align: "center" });

  y = bannerY + 8 + 5;

  // ── Meta box ──────────────────────────────────────────────────────────────────
  const metaBoxH = 22;
  doc.setFillColor(...COLORS.infoBg);
  drawRR(doc, margin, y, contentWidth, metaBoxH, 2);

  const colStep = contentWidth / 4;
  const c1 = margin + 4, c2 = margin + colStep + 4, c3 = margin + colStep * 2 + 4, c4 = margin + colStep * 3 + 4;

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("PO Number",         c1, y + 6);
  doc.text("Order Date",        c2, y + 6);
  doc.text("Expected Delivery", c3, y + 6);
  doc.text("Status",            c4, y + 6);

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFont("helvetica", "bold");
  doc.text(po.poNumber, c1, y + 13);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(po.orderDate).toLocaleDateString("en-IN"), c2, y + 13);
  doc.text(po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString("en-IN") : "\u2014", c3, y + 13);
  const statusLabel = po.status.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  doc.setTextColor(...COLORS.accent);
  doc.text(statusLabel, c4, y + 13);
  doc.setTextColor(...COLORS.textPrimary);

  y += metaBoxH + 5;

  // ── Supplier + Ship-to ────────────────────────────────────────────────────────
  const partyBoxH = 44;
  doc.setFillColor(...COLORS.infoBg);
  drawRR(doc, margin, y, contentWidth, partyBoxH, 2);

  const half = contentWidth / 2;
  const leftX  = margin + 4;
  const rightX = margin + half + 4;
  let lY = y + 6;

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
    if (supplier.phone)         { doc.text(supplier.phone,         leftX, lY); lY += 3.5; }
    if (supplier.email)         { doc.text(supplier.email,         leftX, lY); lY += 3.5; }
    if (supplier.gstNumber)     { doc.text(`GSTIN: ${supplier.gstNumber}`, leftX, lY); lY += 3.5; }
    if (supplier.address) {
      const lines = doc.splitTextToSize(supplier.address, half - 10);
      doc.text(lines.slice(0, 2), leftX, lY);
    }
  } else {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textPrimary);
    doc.text("\u2014", leftX, lY);
  }

  let rY = y + 6;
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("DELIVER TO (SHIP TO)", rightX, rY);
  rY += 5;
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.textPrimary);
  SHIP_TO.split("\n").forEach((line: string, i: number) => {
    if (i === 0) doc.setFont("helvetica", "bold");
    else doc.setFont("helvetica", "normal");
    doc.text(line, rightX, rY);
    rY += 3.8;
  });

  y += partyBoxH + 5;

  // ── Compute GST per line ──────────────────────────────────────────────────────
  type LG = { taxable: number; gstRate: number; gstAmt: number; total: number; hsn: string; unit: string };
  const lineGsts: LG[] = items.map((item: PurchaseOrderItem) => {
    const prod     = item.productId ? productMap.get(item.productId) : undefined;
    const gstRate  = prod ? Number(prod.gstRate) : 0;
    const hsn      = prod?.hsnCode ?? "";
    const unit     = prod?.unit ?? "pcs";
    const qty      = Number(item.quantity);
    const unitCost = Number(item.unitCost);
    const taxable  = qty * unitCost;
    const gstAmt   = Math.round(taxable * gstRate) / 100;
    const total    = taxable + gstAmt;
    return { taxable, gstRate, gstAmt, total, hsn, unit };
  });

  const totalTaxable = lineGsts.reduce((s: number, g: LG) => s + g.taxable, 0);
  const totalGst     = lineGsts.reduce((s: number, g: LG) => s + g.gstAmt, 0);
  const grandTotal   = lineGsts.reduce((s: number, g: LG) => s + g.total, 0);

  const gstGroups = new Map<number, { taxable: number; gst: number }>();
  lineGsts.forEach((g: LG) => {
    const prev = gstGroups.get(g.gstRate) ?? { taxable: 0, gst: 0 };
    gstGroups.set(g.gstRate, { taxable: prev.taxable + g.taxable, gst: prev.gst + g.gstAmt });
  });
  const multiRate = gstGroups.size > 1;

  // ── Table ─────────────────────────────────────────────────────────────────────
  const col = {
    no:      margin,
    desc:    margin + 8,
    hsn:     margin + 82,
    qty:     margin + 104,
    uom:     margin + 116,
    rate:    margin + 130,
    taxable: margin + 152,
    gstPct:  margin + 162,
    gstAmt:  margin + 172,
    total:   pageWidth - margin,
  };

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - 40) { doc.addPage(); y = 20; }
  };

  const tableHeaderH = 9;
  checkPageBreak(tableHeaderH + 10);
  doc.setFillColor(...COLORS.tableHeader);
  drawRR(doc, margin, y, contentWidth, tableHeaderH, 1);
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("#",        col.no + 2,  y + 6);
  doc.text("Item Description", col.desc, y + 6);
  doc.text("HSN",      col.hsn,     y + 6);
  doc.text("Qty",      col.qty,     y + 6, { align: "right" });
  doc.text("UoM",      col.uom + 1, y + 6);
  doc.text("Rate",     col.rate,    y + 6, { align: "right" });
  doc.text("Taxable",  col.taxable, y + 6, { align: "right" });
  doc.text("GST%",     col.gstPct + 1, y + 6);
  doc.text("GST Amt",  col.gstAmt,  y + 6, { align: "right" });
  doc.text("Total",    col.total - 2, y + 6, { align: "right" });
  y += tableHeaderH;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  items.forEach((item: PurchaseOrderItem, idx: number) => {
    const g    = lineGsts[idx];
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
    doc.text(String(idx + 1), col.no + 2, y + 5);
    const descT = doc.splitTextToSize(item.description || prod?.name || "\u2014", 70);
    doc.text(descT[0], col.desc, y + 5);
    doc.text(g.hsn || "\u2014",        col.hsn,    y + 5);
    doc.text(String(item.quantity),    col.qty,    y + 5, { align: "right" });
    doc.text(g.unit,                   col.uom + 1, y + 5);
    doc.text(fmtINR(item.unitCost),    col.rate,   y + 5, { align: "right" });
    doc.text(fmtINR(g.taxable),        col.taxable, y + 5, { align: "right" });
    doc.text(`${g.gstRate}%`,          col.gstPct + 1, y + 5);
    doc.text(fmtINR(g.gstAmt),         col.gstAmt, y + 5, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(fmtINR(g.total),          col.total - 2, y + 5, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += rowH;
  });

  y += 5;

  // ── Summary / Totals ──────────────────────────────────────────────────────────
  const summaryX = pageWidth - margin - 92;
  const sumW     = 92;

  type SRow = { label: string; value: string; bold?: boolean; color?: [number,number,number] };
  const summaryRows: SRow[] = [];
  summaryRows.push({ label: "Taxable Amount", value: fmtINR(totalTaxable) });

  if (multiRate) {
    Array.from(gstGroups.entries())
      .sort(([a]: [number, any], [b]: [number, any]) => a - b)
      .forEach(([rate, { taxable, gst }]: [number, { taxable: number; gst: number }]) => {
        summaryRows.push({ label: `  Taxable @ ${rate}%`, value: fmtINR(taxable), color: COLORS.textSecondary as [number,number,number] });
        summaryRows.push({ label: `  GST @ ${rate}%`,     value: fmtINR(gst),     color: COLORS.textSecondary as [number,number,number] });
      });
    summaryRows.push({ label: "Total GST", value: fmtINR(totalGst) });
  } else {
    const rate = gstGroups.size > 0 ? Array.from(gstGroups.keys())[0] : 0;
    summaryRows.push({ label: `GST (${rate}%)`, value: fmtINR(totalGst) });
  }
  summaryRows.push({ label: "Grand Total", value: fmtINR(grandTotal), bold: true });

  const sRowH  = 6;
  const summaryH = summaryRows.length * sRowH + 4;
  checkPageBreak(summaryH + 25);

  doc.setFillColor(...COLORS.infoBg);
  drawRR(doc, summaryX, y, sumW, summaryH, 2);

  let sy = y + 5;
  summaryRows.forEach((row: SRow) => {
    if (row.bold) {
      doc.setDrawColor(...COLORS.tableBorder);
      doc.line(summaryX + 4, sy - 2, summaryX + sumW - 4, sy - 2);
    }
    doc.setFontSize(row.bold ? 9 : 7.5);
    doc.setFont("helvetica", row.bold ? "bold" : "normal");
    doc.setTextColor(...(row.color ?? COLORS.textPrimary as [number,number,number]));
    doc.text(row.label, summaryX + 4, sy);
    doc.text(row.value, summaryX + sumW - 4, sy, { align: "right" });
    sy += sRowH;
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
  checkPageBreak(40);
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("TERMS & CONDITIONS", margin, y);
  y += 5;
  const termLH = 3.4;
  doc.setFont("helvetica", "normal");
  PO_TERMS.forEach((term: string) => {
    const wrapped = doc.splitTextToSize(`\u2022 ${term}`, contentWidth);
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(wrapped, margin, y);
    y += wrapped.length * termLH + 1.5;
  });

  y += 6;

  // ── Signature ─────────────────────────────────────────────────────────────────
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
    "System-generated Purchase Order \u2014 IT Futuristic Industries Pvt. Ltd.",
    pageWidth / 2, pageHeight - 5, { align: "center" }
  );

  // ── Watermark ────────────────────────────────────────────────────────────────
  const wm = po.status === "pending" ? "DRAFT" : po.status === "cancelled" ? "CANCELLED" : null;
  if (wm) {
    const totalPgs: number = (doc.internal as any).pages.length - 1;
    for (let pg = 1; pg <= Math.max(1, totalPgs); pg++) {
      doc.setPage(pg);
      doc.saveGraphicsState();
      try {
        (doc as any).setGState((doc as any).GState({ opacity: 0.12 }));
      } catch {}
      doc.setFont("helvetica", "bold");
      doc.setFontSize(72);
      const wmColor: [number,number,number] = wm === "CANCELLED" ? [185, 28, 28] : [220, 38, 38];
      doc.setTextColor(...wmColor);
      doc.text(wm, pageWidth / 2, pageHeight / 2, { align: "center", angle: 45 });
      doc.restoreGraphicsState();
    }
  }

  // Return as buffer
  const ab = doc.output("arraybuffer");
  return Buffer.from(ab);
}
