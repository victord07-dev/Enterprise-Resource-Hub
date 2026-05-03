// Dynamic import — jsPDF only loads when the user clicks "Download PDF".
import type jsPDF from "jspdf";
import type { DeliveryChallan, DeliveryChallanItem, Customer, Product } from "@shared/schema";

async function loadJsPDF() {
  const mod = await import("jspdf");
  return mod.default || (mod as any).jsPDF;
}
import { COMPANY } from "@shared/letterhead";
import { ensureNotoSansRegistered } from "@/lib/pdf-fonts";

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
  draftRed:      [220, 38, 38]  as [number, number, number],
  dividerMid:    [203, 213, 225] as [number, number, number],
};

function fmt(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "—";
  return `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function drawWatermark(doc: jsPDF, label: string, top: number, height: number) {
  doc.saveGraphicsState();
  (doc as any).setGState((doc as any).GState({ opacity: 0.07 }));
  doc.setFontSize(52);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.draftRed);
  const cx = doc.internal.pageSize.getWidth() / 2;
  const cy = top + height / 2;
  doc.text(label, cx, cy, { align: "center", angle: 35 });
  doc.restoreGraphicsState();
}

function drawCopyBand(doc: jsPDF, label: string, x: number, y: number, w: number) {
  doc.setFillColor(...COLORS.accent);
  doc.rect(x, y, w, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.white);
  doc.text(label, x + w / 2, y + 5, { align: "center" });
}

function drawCompanyHeader(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  logoDataUrl: string | undefined,
) {
  const headerH = 22;
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(x, y, w, headerH, "F");

  const logoW = 64, logoH = 14, logoY = y + (headerH - logoH) / 2;
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, "PNG", x + 4, logoY, logoW, logoH); }
    catch { _drawCompanyNameFallback(doc, x + 4, y + headerH / 2 + 1); }
  } else {
    _drawCompanyNameFallback(doc, x + 4, y + headerH / 2 + 1);
  }

  const rx = x + w - 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(220, 230, 248);
  doc.text(COMPANY.name, rx, y + 4.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(180, 190, 210);
  doc.text(COMPANY.address.substring(0, 65), rx, y + 8, { align: "right" });
  doc.text(`GSTIN: ${COMPANY.gstin}   ${COMPANY.phone}`, rx, y + 11.5, { align: "right" });
  doc.text(`${COMPANY.email}   ${COMPANY.website}`, rx, y + 15, { align: "right" });

  return headerH;
}

function _drawCompanyNameFallback(doc: jsPDF, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.headerText);
  doc.text(COMPANY.name, x, y);
}

function drawOneCopy(
  doc: jsPDF,
  challan: DeliveryChallan,
  items: DeliveryChallanItem[],
  customer: Customer | undefined,
  products: Product[],
  copyLabel: string,
  startY: number,
  maxHeight: number,
  isDraft: boolean,
  logoDataUrl: string | undefined,
) {
  const margin = 8;
  const pageWidth = doc.internal.pageSize.getWidth();
  const w = pageWidth - margin * 2;
  let y = startY;

  // ── Company header ────────────────────────────────────────────────────────
  const headerH = drawCompanyHeader(doc, margin, y, w, logoDataUrl);
  y += headerH;

  // ── Copy label band ───────────────────────────────────────────────────────
  drawCopyBand(doc, `DELIVERY CHALLAN  ·  ${copyLabel}`, margin, y, w);
  y += 7;

  // ── Info row: challan number, date, SO ref ────────────────────────────────
  const infoBoxH = 14;
  doc.setFillColor(...COLORS.infoBg);
  doc.rect(margin, y, w, infoBoxH, "F");

  const colW = w / 4;
  const c1 = margin + 3, c2 = margin + colW + 3, c3 = margin + colW * 2 + 3, c4 = margin + colW * 3 + 3;

  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Challan No.", c1, y + 4.5);
  doc.text("Date", c2, y + 4.5);
  doc.text("Dispatch Date", c3, y + 4.5);
  doc.text("Vehicle No.", c4, y + 4.5);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(challan.challanNumber, c1, y + 10);
  doc.setFont("helvetica", "normal");
  doc.text(fmtDate(challan.createdAt), c2, y + 10);
  doc.text(challan.dispatchDate ? fmtDate(challan.dispatchDate) : "—", c3, y + 10);
  doc.text(challan.vehicleNumber || "—", c4, y + 10);

  y += infoBoxH + 1;

  // ── Bill To / Deliver To row ───────────────────────────────────────────────
  const addressBoxH = 14;
  doc.setFillColor(...COLORS.white);
  doc.setDrawColor(...COLORS.tableBorder);
  doc.rect(margin, y, w / 2 - 1, addressBoxH, "S");
  doc.rect(margin + w / 2 + 1, y, w / 2 - 1, addressBoxH, "S");

  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Bill To / Customer", margin + 3, y + 4);
  doc.text("Deliver To / Driver", margin + w / 2 + 4, y + 4);

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(customer?.name || "—", margin + 3, y + 8.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...COLORS.textSecondary);
  if (customer?.phone) doc.text(customer.phone, margin + 3, y + 12);

  // Driver / address right column
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(challan.driverName || "—", margin + w / 2 + 4, y + 8.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...COLORS.textSecondary);
  if (challan.deliveryAddress) {
    const addrLines = doc.splitTextToSize(challan.deliveryAddress, w / 2 - 10);
    doc.text(addrLines[0], margin + w / 2 + 4, y + 12);
  }

  y += addressBoxH + 2;

  // ── Items table ───────────────────────────────────────────────────────────
  const tblHeaderH = 6;
  doc.setFillColor(...COLORS.tableHeader);
  doc.rect(margin, y, w, tblHeaderH, "F");

  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);

  const cNo   = margin + 2;
  const cDesc = margin + 9;
  const cHsn  = margin + w * 0.55;
  const cQty  = margin + w * 0.68;
  const cRate = margin + w * 0.80;
  const cAmt  = margin + w - 2;

  doc.text("#",          cNo,   y + 4.3);
  doc.text("Description",cDesc, y + 4.3);
  doc.text("HSN",        cHsn,  y + 4.3);
  doc.text("Qty",        cQty,  y + 4.3, { align: "right" });
  doc.text("Rate",       cRate, y + 4.3, { align: "right" });
  doc.text("Amount",     cAmt,  y + 4.3, { align: "right" });

  y += tblHeaderH;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  let subtotal = 0;

  items.forEach((item, idx) => {
    const prod    = products.find(p => p.id === item.productId);
    const qty     = Number(item.qtyToDispatch ?? item.quantity ?? 0);
    const rate    = Number(item.unitPrice ?? 0);
    const lineAmt = qty * rate;
    subtotal += lineAmt;

    const rowH = 5.5;
    const ry = y;

    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, ry, w, rowH, "F");
    }
    doc.setDrawColor(...COLORS.tableBorder);
    doc.line(margin, ry + rowH, margin + w, ry + rowH);

    doc.setTextColor(...COLORS.textPrimary);
    doc.text(String(idx + 1),                           cNo,   ry + 4);
    const descText = doc.splitTextToSize(item.description || prod?.name || "—", w * 0.45);
    doc.text(descText[0],                               cDesc, ry + 4);
    doc.setTextColor(...COLORS.textSecondary);
    doc.text(prod?.hsnCode || "—",                      cHsn,  ry + 4);
    doc.setTextColor(...COLORS.textPrimary);
    doc.text(String(qty),                               cQty,  ry + 4, { align: "right" });
    doc.text(fmt(rate),                                 cRate, ry + 4, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(fmt(lineAmt),                              cAmt,  ry + 4, { align: "right" });
    doc.setFont("helvetica", "normal");

    y += rowH;
  });

  // ── Subtotal row ──────────────────────────────────────────────────────────
  y += 2;
  const totBoxW = 60;
  const totBoxX = margin + w - totBoxW;
  doc.setFillColor(...COLORS.infoBg);
  doc.rect(totBoxX, y, totBoxW, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text("Sub-total", totBoxX + 3, y + 5.5);
  doc.text(fmt(subtotal), margin + w - 2, y + 5.5, { align: "right" });
  y += 10;

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (challan.notes) {
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textSecondary);
    const noteLines = doc.splitTextToSize(`Notes: ${challan.notes}`, w);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 3.5 + 2;
  }

  // ── Signature row ─────────────────────────────────────────────────────────
  const sigY = startY + maxHeight - 14;
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(margin, sigY, margin + w / 3, sigY);
  doc.line(margin + w * 0.65, sigY, margin + w, sigY);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Receiver's Signature & Stamp", margin, sigY + 4);
  doc.text("For IT Futuristic Industries Pvt. Ltd.", margin + w, sigY + 4, { align: "right" });
  doc.setFontSize(5.5);
  doc.text("Authorised Signatory", margin + w, sigY + 8, { align: "right" });

  // ── Watermark (DRAFT) ─────────────────────────────────────────────────────
  if (isDraft) {
    drawWatermark(doc, "DRAFT", startY, maxHeight);
  }
}

export async function generateChallanPDF(
  challan: DeliveryChallan,
  items: DeliveryChallanItem[],
  customer: Customer | undefined,
  products: Product[],
  logoDataUrl?: string,
) {
  const doc = new (await loadJsPDF())({ orientation: "portrait", unit: "mm", format: "a4" });
  await ensureNotoSansRegistered(doc);
  const pageHeight = doc.internal.pageSize.getHeight();
  const halfH      = pageHeight / 2 - 2;
  const isDraft    = ["draft", "ready", "do_issued"].includes(challan.status);

  // TOP COPY: OFFICE COPY
  drawOneCopy(doc, challan, items, customer, products, "OFFICE COPY", 2, halfH, isDraft, logoDataUrl);

  // Dashed separator between the two copies
  doc.setDrawColor(...COLORS.dividerMid);
  doc.setLineDashPattern([3, 2], 0);
  doc.line(8, halfH + 2, doc.internal.pageSize.getWidth() - 8, halfH + 2);
  doc.setLineDashPattern([], 0);
  const cx = doc.internal.pageSize.getWidth() / 2;
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("— Cut Here —", cx, halfH + 2, { align: "center" });

  // BOTTOM COPY: DRIVER COPY
  drawOneCopy(doc, challan, items, customer, products, "DRIVER COPY", halfH + 4, halfH - 4, isDraft, logoDataUrl);

  doc.save(`${challan.challanNumber}.pdf`);
}
