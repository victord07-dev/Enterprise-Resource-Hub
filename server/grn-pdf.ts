import { jsPDF } from "jspdf";
import { COMPANY as SHARED_COMPANY } from "@shared/letterhead";
import { drawLetterhead } from "@shared/pdf-letterhead";
import { ensureNotoSansRegistered } from "./lib/pdf-fonts";

const COLORS = {
  headerBg:      [30, 41, 59]   as [number, number, number],
  accent:        [59, 130, 246]  as [number, number, number],
  textPrimary:   [15, 23, 42]   as [number, number, number],
  textSecondary: [100, 116, 139] as [number, number, number],
  tableBorder:   [226, 232, 240] as [number, number, number],
  tableHeader:   [241, 245, 249] as [number, number, number],
  white:         [255, 255, 255] as [number, number, number],
  watermarkRed:  [220, 53, 69]   as [number, number, number],
  watermarkGray: [150, 150, 150] as [number, number, number],
};

// GRN historically used an em-dash variant of the address. Preserve while
// pulling the rest from shared so single-source-of-truth holds.
const COMPANY = {
  name:    SHARED_COMPANY.name,
  gstin:   SHARED_COMPANY.gstin,
  phone:   SHARED_COMPANY.phone,
  email:   SHARED_COMPANY.email,
  address: "Dag No: 471, Patta Number: 250, Goroimaria Pathar Aibheti, Nagaon — 782002, Assam",
};

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtINR(val: number | string): string {
  return `Rs. ${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface GrnPdfItem {
  productId: string;
  description?: string | null;
  productName?: string;
  hsnCode?: string | null;
  orderedQuantity: number;
  receivedQuantity: number;
  buyingPrice: string | number;
  totalCost: string | number;
}

export interface GrnPdfData {
  grnNumber: string;
  status: string;
  receivedDate: Date | string | null;
  supplierChallanNumber?: string | null;
  supplierChallanDate?: Date | string | null;
  notes?: string | null;
  confirmedAt?: Date | string | null;
  deliveryCost?: string | number | null;
  totalAmount: string | number;
  poNumber?: string;
  poDate?: Date | string | null;
  supplierName?: string;
  supplierAddress?: string | null;
  supplierGstin?: string | null;
  warehouseName?: string;
  items: GrnPdfItem[];
}

export function generateGrnPdf(data: GrnPdfData): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  ensureNotoSansRegistered(doc);
  const PW = 210;
  const PH = 297;
  const ML = 14;
  const MR = 14;
  const CW = PW - ML - MR;

  // Phase 4C P6-EXT — canonical letterhead. GRN# + receipt date go in
  // bannerSubtitle (right-aligned in the blue banner) so the navy band
  // stays identical to every other PDF.
  let y = drawLetterhead(doc, {
    pageWidth: PW,
    margin: ML,
    title: "GOODS RECEIPT NOTE",
    bannerSubtitle: `GRN: ${data.grnNumber} · ${fmtDate(data.receivedDate)}`,
  });

  // ── Info grid ──────────────────────────────────────────────────────────────
  doc.setFillColor(...COLORS.tableHeader);
  doc.rect(ML, y, CW, 30, "F");
  doc.setDrawColor(...COLORS.tableBorder);
  doc.rect(ML, y, CW, 30);

  const col1 = ML + 3;
  const col2 = ML + CW / 2 + 3;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textPrimary);

  const infoLine = (label: string, val: string | undefined, lx: number, ly: number) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text(label, lx, ly);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textPrimary);
    doc.text(val || "—", lx + 38, ly);
  };

  infoLine("Supplier:", data.supplierName, col1, y + 6);
  infoLine("Supplier GSTIN:", data.supplierGstin || undefined, col1, y + 12);
  infoLine("Supplier Address:", data.supplierAddress || undefined, col1, y + 18);
  infoLine("Warehouse:", data.warehouseName, col2, y + 6);
  infoLine("PO Reference:", data.poNumber, col2, y + 12);
  infoLine("PO Date:", data.poDate ? fmtDate(data.poDate) : undefined, col2, y + 18);
  infoLine("Supplier Challan No.:", data.supplierChallanNumber || undefined, col1, y + 24);
  infoLine("Challan Date:", data.supplierChallanDate ? fmtDate(data.supplierChallanDate) : undefined, col2, y + 24);

  y += 36;

  // ── Items table ────────────────────────────────────────────────────────────
  const cols = [
    { label: "#",           w: 8,  align: "center" as const },
    { label: "Product / Description", w: 65, align: "left" as const },
    { label: "HSN",         w: 22, align: "center" as const },
    { label: "Ordered",     w: 20, align: "center" as const },
    { label: "Received",    w: 20, align: "center" as const },
    { label: "Discrepancy", w: 22, align: "center" as const },
    { label: "Unit Price",  w: 28, align: "right" as const },
    { label: "Total Cost",  w: 28, align: "right" as const },
  ];
  const ROW_H = 7;
  const HEADER_H = 8;

  // Header
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(ML, y, CW, HEADER_H, "F");

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.white);
  let cx = ML;
  for (const col of cols) {
    const tx = col.align === "center" ? cx + col.w / 2 : col.align === "right" ? cx + col.w - 1 : cx + 1;
    doc.text(col.label, tx, y + 5.5, { align: col.align });
    cx += col.w;
  }
  y += HEADER_H;

  // Rows
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textPrimary);

  data.items.forEach((item, idx) => {
    const rowBg = idx % 2 === 0 ? COLORS.white : [248, 250, 252] as [number, number, number];
    doc.setFillColor(...rowBg);
    doc.rect(ML, y, CW, ROW_H, "F");
    doc.setDrawColor(...COLORS.tableBorder);
    doc.rect(ML, y, CW, ROW_H);

    const name = item.productName || item.description || item.productId;
    const discrepancy = item.receivedQuantity - item.orderedQuantity;
    const discStr = discrepancy === 0 ? "—" : discrepancy > 0 ? `+${discrepancy}` : String(discrepancy);

    const vals = [
      String(idx + 1),
      name.length > 38 ? name.slice(0, 37) + "…" : name,
      item.hsnCode || "—",
      String(item.orderedQuantity),
      String(item.receivedQuantity),
      discStr,
      fmtINR(item.buyingPrice),
      fmtINR(item.totalCost),
    ];

    cx = ML;
    cols.forEach((col, ci) => {
      const tx = col.align === "center" ? cx + col.w / 2 : col.align === "right" ? cx + col.w - 1 : cx + 1;
      // Colour discrepancy
      if (ci === 5 && discrepancy !== 0) {
        doc.setTextColor(discrepancy > 0 ? 22 : 220, discrepancy > 0 ? 163 : 53, discrepancy > 0 ? 74 : 69);
      } else {
        doc.setTextColor(...COLORS.textPrimary);
      }
      doc.text(vals[ci], tx, y + 4.8, { align: col.align });
      cx += col.w;
    });
    y += ROW_H;
  });

  // Footer totals row
  y += 2;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textPrimary);
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(ML, y, ML + CW, y);
  y += 5;

  if (data.deliveryCost && Number(data.deliveryCost) > 0) {
    doc.setFont("helvetica", "normal");
    doc.text("Delivery Cost:", ML + CW - 50, y, { align: "left" });
    doc.setFont("helvetica", "bold");
    doc.text(fmtINR(data.deliveryCost), ML + CW, y, { align: "right" });
    y += 6;
  }

  doc.setFont("helvetica", "bold");
  doc.text("Total Amount:", ML + CW - 50, y, { align: "left" });
  doc.text(fmtINR(data.totalAmount), ML + CW, y, { align: "right" });
  y += 10;

  // Notes
  if (data.notes) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textSecondary);
    doc.text(`Notes: ${data.notes}`, ML, y);
    y += 8;
  }

  // Signature line
  y = Math.max(y + 10, PH - 45);
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(ML, y, ML + 55, y);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Authorized Signatory", ML, y + 5);
  doc.setFont("helvetica", "italic");
  doc.text("For IT Futuristic Industries Pvt. Ltd.", ML, y + 10);

  // ── Watermark ──────────────────────────────────────────────────────────────
  if (data.status === "draft") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(60);
    doc.setTextColor(200, 200, 200);
    doc.setGState(doc.GState({ opacity: 0.15 }));
    doc.text("DRAFT", PW / 2, PH / 2, { align: "center", angle: 45 });
    doc.setGState(doc.GState({ opacity: 1 }));
  } else if (data.status === "cancelled") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(60);
    doc.setTextColor(...COLORS.watermarkRed);
    doc.setGState(doc.GState({ opacity: 0.15 }));
    doc.text("CANCELLED", PW / 2, PH / 2, { align: "center", angle: 45 });
    doc.setGState(doc.GState({ opacity: 1 }));
  }

  return Buffer.from(doc.output("arraybuffer"));
}
