// Dynamic import — jsPDF only loads when the user clicks "Download PDF".
import type jsPDF from "jspdf";
import type { DeliveryChallan, DeliveryChallanItem, Customer, Product } from "@shared/schema";
import { drawLetterhead } from "@shared/pdf-letterhead";
import { ensureNotoSansRegistered } from "@/lib/pdf-fonts";
import logoAssetUrl from "@assets/HE-LOGO.jpeg";

async function loadLogoDataUrl(): Promise<string> {
  const res = await fetch(logoAssetUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function loadJsPDF() {
  const mod = await import("jspdf");
  return mod.default || (mod as any).jsPDF;
}

const C = {
  headerBg:      [30, 41, 59]   as [number, number, number],
  headerText:    [255, 255, 255] as [number, number, number],
  accent:        [59, 130, 246]  as [number, number, number],
  textPrimary:   [15, 23, 42]   as [number, number, number],
  textSecondary: [100, 116, 139] as [number, number, number],
  tableBorder:   [226, 232, 240] as [number, number, number],
  tableHeader:   [241, 245, 249] as [number, number, number],
  tableAlt:      [248, 250, 252] as [number, number, number],
  white:         [255, 255, 255] as [number, number, number],
  infoBg:        [248, 250, 252] as [number, number, number],
  draftRed:      [220, 38, 38]  as [number, number, number],
  sigBg:         [245, 247, 250] as [number, number, number],
};

function fmt(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "\u2014";
  return `\u20b9${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function drawWatermark(doc: jsPDF, label: string) {
  doc.saveGraphicsState();
  (doc as any).setGState((doc as any).GState({ opacity: 0.06 }));
  doc.setFontSize(72);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.draftRed);
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.text(label, pw / 2, ph / 2, { align: "center", angle: 35 });
  doc.restoreGraphicsState();
}

export async function generateChallanPDF(
  challan: DeliveryChallan,
  items: DeliveryChallanItem[],
  customer: Customer | undefined,
  products: Product[],
  bundleCompsMap?: Record<string, Array<{ componentProductId: string; quantity: number; unit?: string }>>,
  logoDataUrl?: string,
  /** GST rates locked on the linked sales order, keyed by productId */
  soItemGstMap?: Record<string, { gstRate: number; hsnCode?: string | null }>,
  /** Combo serial records allocated to this challan, grouped by productId */
  comboSerialsMap?: Record<string, Array<{ comboUnitIndex: number; componentName: string; serialNumber: string }>>,
) {
  const JsPDF = await loadJsPDF();
  const doc: jsPDF = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await ensureNotoSansRegistered(doc);

  // Load the HE logo — prefer caller-supplied, otherwise fetch from Vite asset
  const resolvedLogoUrl = logoDataUrl ?? await loadLogoDataUrl().catch(() => undefined);

  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageWidth - margin * 2;
  const isDraft = ["draft", "ready", "do_issued"].includes(challan.status);

  // ── Letterhead ──────────────────────────────────────────────────────────────
  let y = drawLetterhead(doc, {
    pageWidth,
    margin,
    title: `DELIVERY CHALLAN  \u00b7  ${challan.challanNumber}`,
    logoDataUrl: resolvedLogoUrl,
    bannerSubtitle: fmtDate(challan.createdAt),
  });

  // ── Info strip (4 cells) ────────────────────────────────────────────────────
  const stripH = 14;
  doc.setFillColor(...C.infoBg);
  doc.setDrawColor(...C.tableBorder);
  doc.rect(margin, y, contentW, stripH, "FD");

  const colW = contentW / 4;
  const cells = [
    ["Challan No.", challan.challanNumber],
    ["Date", fmtDate(challan.createdAt)],
    ["Dispatch Date", challan.dispatchDate ? fmtDate(challan.dispatchDate) : "\u2014"],
    ["Vehicle No.", challan.vehicleNumber || "\u2014"],
  ];
  cells.forEach(([label, value], i) => {
    const cx = margin + colW * i + 3;
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.textSecondary);
    doc.text(label, cx, y + 5);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.textPrimary);
    doc.text(value, cx, y + 11);
    if (i > 0) {
      doc.setDrawColor(...C.tableBorder);
      doc.line(margin + colW * i, y, margin + colW * i, y + stripH);
    }
  });
  y += stripH + 2;

  // ── Bill To / Deliver To ────────────────────────────────────────────────────
  const addrBoxH = 18;
  const halfW = (contentW - 3) / 2;

  // Left: Bill To
  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.tableBorder);
  doc.rect(margin, y, halfW, addrBoxH, "FD");
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textSecondary);
  doc.text("Bill To / Customer", margin + 3, y + 4.5);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.textPrimary);
  doc.text(customer?.name || "\u2014", margin + 3, y + 9.5);
  if (customer?.phone || customer?.email) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textSecondary);
    doc.text([customer?.phone || "", customer?.email || ""].filter(Boolean).join("  |  "), margin + 3, y + 14);
  }

  // Right: Deliver To
  const rx2 = margin + halfW + 3;
  doc.setFillColor(...C.white);
  doc.rect(rx2, y, halfW, addrBoxH, "FD");
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textSecondary);
  doc.text("Deliver To / Address", rx2 + 3, y + 4.5);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.textPrimary);
  if (challan.deliveryAddress) {
    const addrLines = doc.splitTextToSize(challan.deliveryAddress, halfW - 8);
    doc.text(addrLines.slice(0, 2), rx2 + 3, y + 9.5);
  } else {
    doc.text("\u2014", rx2 + 3, y + 9.5);
  }
  y += addrBoxH + 2;

  // ── Driver strip ────────────────────────────────────────────────────────────
  const driverStripH = 11;

  doc.setFillColor(...C.infoBg);
  doc.setDrawColor(...C.tableBorder);
  doc.rect(margin, y, contentW, driverStripH, "FD");

  const driverMid = y + driverStripH / 2 + 1;
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textSecondary);
  doc.text("Driver / Transport", margin + 3, y + 4);

  const driverName = challan.driverName || "\u2014";
  const driverPhone = challan.driverPhone || "";

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.textPrimary);
  doc.text(driverName, margin + 3, driverMid + 1.5);

  if (driverPhone) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.textPrimary);
    doc.text(driverPhone, margin + contentW - 3, driverMid + 1.5, { align: "right" });
  }

  y += driverStripH + 3;

  // ── GST Items Table ─────────────────────────────────────────────────────────
  // Columns: SR | Description | HSN/SAC | Qty | Price/Item | Taxable Value | CGST Rate | CGST Amt | SGST Rate | SGST Amt | IGST Rate | IGST Amt
  const COL = {
    sr:      { x: margin,                   w: 7  },
    desc:    { x: margin + 7,               w: 44 },
    hsn:     { x: margin + 51,              w: 18 },
    qty:     { x: margin + 69,              w: 11 },
    rate:    { x: margin + 80,              w: 20 },
    taxable: { x: margin + 100,             w: 21 },
    cgstR:   { x: margin + 121,             w: 10 },
    cgstA:   { x: margin + 131,             w: 16 },
    sgstR:   { x: margin + 147,             w: 10 },
    sgstA:   { x: margin + 157,             w: 15 },
    igstR:   { x: margin + 172,             w: 9  },
    igstA:   { x: margin + 181,             w: contentW - 181 },
  };

  const tblHdrH = 10;
  doc.setFillColor(...C.tableHeader);
  doc.setDrawColor(...C.tableBorder);
  doc.rect(margin, y, contentW, tblHdrH, "FD");

  const HEADERS: [keyof typeof COL, string][] = [
    ["sr",      "#"],
    ["desc",    "Description"],
    ["hsn",     "HSN / SAC"],
    ["qty",     "Qty"],
    ["rate",    "Price / Item"],
    ["taxable", "Taxable Value"],
    ["cgstR",   "CGST%"],
    ["cgstA",   "CGST\u20b9"],
    ["sgstR",   "SGST%"],
    ["sgstA",   "SGST\u20b9"],
    ["igstR",   "IGST%"],
    ["igstA",   "IGST\u20b9"],
  ];

  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.textSecondary);
  const midY = y + 5.5;
  HEADERS.forEach(([key, label]) => {
    const col = COL[key];
    const align = ["sr", "desc", "hsn"].includes(key) ? "left" : "right";
    const tx = align === "right" ? col.x + col.w - 1.5 : col.x + 2;
    doc.text(label, tx, midY, { align });
    doc.line(col.x, y, col.x, y + tblHdrH);
  });
  doc.line(margin + contentW, y, margin + contentW, y + tblHdrH);
  y += tblHdrH;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  let taxableTotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;
  let rowIdx = 0;

  for (const item of items) {
    const prod    = products.find(p => p.id === item.productId);
    const qty     = Number(item.qtyToDispatch ?? item.quantity ?? 0);
    const rate    = Number(item.unitPrice ?? 0);
    const taxable = qty * rate;
    // Prefer the GST rate locked on the SO line item; fall back to product master
    const gstRate = soItemGstMap?.[item.productId]?.gstRate
      ?? Number((prod as any)?.gstRate ?? 0);
    const halfGst = gstRate / 2;
    const cgstAmt = taxable * halfGst / 100;
    const sgstAmt = taxable * halfGst / 100;
    taxableTotal += taxable;
    cgstTotal    += cgstAmt;
    sgstTotal    += sgstAmt;

    const rowH = 6;
    if (rowIdx % 2 === 0) {
      doc.setFillColor(...C.tableAlt);
      doc.rect(margin, y, contentW, rowH, "F");
    }
    doc.setDrawColor(...C.tableBorder);
    doc.line(margin, y + rowH, margin + contentW, y + rowH);
    Object.values(COL).forEach(col => {
      doc.line(col.x, y, col.x, y + rowH);
    });
    doc.line(margin + contentW, y, margin + contentW, y + rowH);

    doc.setTextColor(...C.textPrimary);
    const rowMid = y + 4.2;
    // SR
    doc.text(String(rowIdx + 1), COL.sr.x + 2, rowMid);
    // Description
    const descTxt = doc.splitTextToSize(item.description || prod?.name || "\u2014", COL.desc.w - 3);
    doc.text(descTxt[0], COL.desc.x + 2, rowMid);
    // HSN
    doc.setTextColor(...C.textSecondary);
    doc.text(soItemGstMap?.[item.productId]?.hsnCode || prod?.hsnCode || "\u2014", COL.hsn.x + 2, rowMid);
    doc.setTextColor(...C.textPrimary);
    // Qty
    doc.text(String(qty),                                         COL.qty.x + COL.qty.w - 1.5,     rowMid, { align: "right" });
    // Rate
    doc.text(fmt(rate),                                           COL.rate.x + COL.rate.w - 1.5,   rowMid, { align: "right" });
    // Taxable
    doc.setFont("helvetica", "bold");
    doc.text(fmt(taxable),                                        COL.taxable.x + COL.taxable.w - 1.5, rowMid, { align: "right" });
    doc.setFont("helvetica", "normal");
    // CGST
    doc.setTextColor(...C.textSecondary);
    doc.text(gstRate > 0 ? `${halfGst}%` : "\u2014",            COL.cgstR.x + COL.cgstR.w - 1.5, rowMid, { align: "right" });
    doc.setTextColor(...C.textPrimary);
    doc.text(gstRate > 0 ? fmt(cgstAmt) : "\u2014",              COL.cgstA.x + COL.cgstA.w - 1.5, rowMid, { align: "right" });
    doc.setTextColor(...C.textSecondary);
    doc.text(gstRate > 0 ? `${halfGst}%` : "\u2014",            COL.sgstR.x + COL.sgstR.w - 1.5, rowMid, { align: "right" });
    doc.setTextColor(...C.textPrimary);
    doc.text(gstRate > 0 ? fmt(sgstAmt) : "\u2014",              COL.sgstA.x + COL.sgstA.w - 1.5, rowMid, { align: "right" });
    doc.setTextColor(...C.textSecondary);
    doc.text("0%",                                                COL.igstR.x + COL.igstR.w - 1.5, rowMid, { align: "right" });
    doc.text("\u2014",                                            COL.igstA.x + COL.igstA.w - 1.5, rowMid, { align: "right" });
    doc.setTextColor(...C.textPrimary);
    y += rowH;
    rowIdx++;

    // Combo serial sub-rows: print allocated serial numbers below the combo line item
    if ((prod as any)?.type === "combo" && item.productId && comboSerialsMap?.[item.productId]) {
      const serials = comboSerialsMap[item.productId];
      // Group by unit index
      const byUnit = new Map<number, Array<{ componentName: string; serialNumber: string }>>();
      for (const sr of serials) {
        if (!byUnit.has(sr.comboUnitIndex)) byUnit.set(sr.comboUnitIndex, []);
        byUnit.get(sr.comboUnitIndex)!.push({ componentName: sr.componentName, serialNumber: sr.serialNumber });
      }
      for (const [unitIdx, comps] of Array.from(byUnit.entries())) {
        const unitLabelH = 5;
        doc.setFillColor(240, 253, 250); // teal-50
        doc.rect(margin, y, contentW, unitLabelH, "F");
        doc.setDrawColor(...C.tableBorder);
        doc.line(margin, y + unitLabelH, margin + contentW, y + unitLabelH);
        Object.values(COL).forEach(col => doc.line(col.x, y, col.x, y + unitLabelH));
        doc.line(margin + contentW, y, margin + contentW, y + unitLabelH);
        const unitMid = y + 3.5;
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 118, 110); // teal-700
        doc.text(`  Unit ${unitIdx}:`, COL.desc.x + 2, unitMid);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textPrimary);
        y += unitLabelH;

        for (const comp of comps) {
          const compRowH = 4.5;
          doc.setFillColor(240, 253, 250);
          doc.rect(margin, y, contentW, compRowH, "F");
          doc.setDrawColor(...C.tableBorder);
          doc.line(margin, y + compRowH, margin + contentW, y + compRowH);
          Object.values(COL).forEach(col => doc.line(col.x, y, col.x, y + compRowH));
          doc.line(margin + contentW, y, margin + contentW, y + compRowH);
          const compMid = y + 3;
          doc.setFontSize(5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textSecondary);
          doc.text(`    └ ${comp.componentName}`, COL.desc.x + 2, compMid);
          doc.setTextColor(15, 118, 110);
          doc.setFont("helvetica", "bold");
          doc.text(comp.serialNumber, COL.hsn.x + 2, compMid);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textPrimary);
          doc.setFontSize(6.5);
          y += compRowH;
        }
      }
    }

    // Bundle sub-rows: list component products below the bundle parent row
    if ((prod as any)?.type === "bundle" && item.productId && bundleCompsMap?.[item.productId]) {
      for (const comp of bundleCompsMap[item.productId]) {
        const compProd = products.find(p => p.id === comp.componentProductId);
        const compQty = Number(comp.quantity ?? 1) * qty;
        const subRowH = 5.5;
        doc.setFillColor(245, 243, 255);
        doc.rect(margin, y, contentW, subRowH, "F");
        doc.setDrawColor(...C.tableBorder);
        doc.line(margin, y + subRowH, margin + contentW, y + subRowH);
        Object.values(COL).forEach(col => doc.line(col.x, y, col.x, y + subRowH));
        doc.line(margin + contentW, y, margin + contentW, y + subRowH);
        const subMid = y + 3.8;
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textSecondary);
        doc.text("\u2514 " + (compProd?.name || comp.componentProductId || "\u2014"), COL.desc.x + 5, subMid);
        doc.text(compProd?.hsnCode || "\u2014", COL.hsn.x + 2, subMid);
        doc.text(String(compQty), COL.qty.x + COL.qty.w - 1.5, subMid, { align: "right" });
        doc.text("\u2014", COL.rate.x + COL.rate.w - 1.5, subMid, { align: "right" });
        doc.text("\u2014", COL.taxable.x + COL.taxable.w - 1.5, subMid, { align: "right" });
        doc.setTextColor(...C.textPrimary);
        doc.setFontSize(6.5);
        y += subRowH;
        rowIdx++;
      }
    }
  }

  // ── Totals row ──────────────────────────────────────────────────────────────
  const grandTotal = taxableTotal + cgstTotal + sgstTotal + igstTotal;
  const totH = 8;
  doc.setFillColor(...C.infoBg);
  doc.setDrawColor(...C.tableBorder);
  doc.rect(margin, y, contentW, totH, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...C.textPrimary);
  const totMid = y + 5;
  doc.text("TOTALS", COL.desc.x + 2, totMid);
  doc.text(fmt(taxableTotal), COL.taxable.x + COL.taxable.w - 1.5, totMid, { align: "right" });
  doc.text(fmt(cgstTotal),    COL.cgstA.x + COL.cgstA.w - 1.5,     totMid, { align: "right" });
  doc.text(fmt(sgstTotal),    COL.sgstA.x + COL.sgstA.w - 1.5,     totMid, { align: "right" });
  doc.text("\u2014",          COL.igstA.x + COL.igstA.w - 1.5,     totMid, { align: "right" });
  y += totH + 2;

  // Grand total box
  const gtBoxW = 75;
  doc.setFillColor(...C.accent);
  doc.rect(margin + contentW - gtBoxW, y, gtBoxW, 8, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.white);
  doc.text("Grand Total (incl. GST)", margin + contentW - gtBoxW + 3, y + 5.5);
  doc.text(fmt(grandTotal), margin + contentW - 2, y + 5.5, { align: "right" });
  y += 10;

  // ── Notes ───────────────────────────────────────────────────────────────────
  if (challan.notes) {
    doc.setFontSize(6);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...C.textSecondary);
    const noteLines = doc.splitTextToSize(`Notes: ${challan.notes}`, contentW);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4 + 2;
  }

  // ── Signature boxes (pinned near bottom, with overflow guard) ──────────────
  const sigH = 22;
  const sigY  = Math.max(y + 8, pageHeight - margin - sigH - 14);
  const sigW  = (contentW - 6) / 2;

  [[margin, "Dispatched by (seal & sign)"], [margin + sigW + 6, "Received by (seal & sign)"]] .forEach(([bx, label]) => {
    const bxNum = Number(bx);
    doc.setFillColor(...C.sigBg);
    doc.setDrawColor(...C.tableBorder);
    doc.rect(bxNum, sigY, sigW, sigH, "FD");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.textSecondary);
    doc.text(String(label), bxNum + sigW / 2, sigY + 4, { align: "center" });
    // signature line
    doc.setDrawColor(...C.tableBorder);
    doc.line(bxNum + 6, sigY + sigH - 4, bxNum + sigW - 6, sigY + sigH - 4);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.text("Name & Stamp", bxNum + sigW / 2, sigY + sigH - 1, { align: "center" });
  });

  // ── Printed by footer ───────────────────────────────────────────────────────
  const footerY = pageHeight - margin + 2;
  doc.setFontSize(6);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...C.textSecondary);
  const printedByLabel = `Printed by: ${(challan as any).printedBy || "\u2014"}`;
  doc.text(printedByLabel, margin, footerY);
  doc.text(`Generated on: ${new Date().toLocaleString("en-IN")}`, margin + contentW, footerY, { align: "right" });

  // ── DRAFT watermark ─────────────────────────────────────────────────────────
  if (isDraft) drawWatermark(doc, "DRAFT");

  doc.save(`${challan.challanNumber}.pdf`);
}
