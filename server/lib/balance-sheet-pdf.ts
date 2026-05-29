/**
 * Phase 4D-B — Balance Sheet PDF generator (server-side, jsPDF).
 *
 * Rules:
 *   - jsPDF manual primitives only (no autotable)
 *   - drawLetterhead from shared/pdf-letterhead.ts
 *   - NotoSans via ensureNotoSansRegistered for ₹ symbol
 *   - ARROW=">" WARN_GLYPH="!" — no Unicode arrows/warn glyphs
 *   - Indian number formatting: en-IN locale
 */

import { jsPDF } from "jspdf";
import { drawLetterhead, RUPEE, EM_DASH } from "@shared/pdf-letterhead";
import { ensureNotoSansRegistered } from "./pdf-fonts";
import type { BalanceSheetResult } from "./financial-aggregations";

function inr(n: number): string {
  return RUPEE + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PAGE_W  = 210;
const MARGIN  = 14;
const COL_W   = (PAGE_W - MARGIN * 2) / 2 - 4; // two-column layout
const COL2_X  = MARGIN + COL_W + 8;
const LINE_H  = 5.5;

function drawSectionHeader(doc: any, x: number, y: number, w: number, label: string, C: any) {
  doc.setFillColor(...C.accent);
  doc.rect(x, y, w, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.white);
  doc.text(label.toUpperCase(), x + 2, y + 4.2);
  return y + 6 + 1;
}

function drawRow(
  doc: any, x: number, y: number, w: number,
  label: string, amount: number | null,
  opts: { bold?: boolean; indent?: number; shade?: boolean; topBorder?: boolean; C: any },
): number {
  const C = opts.C;
  if (opts.shade) {
    doc.setFillColor(245, 247, 250);
    doc.rect(x, y, w, LINE_H, "F");
  }
  if (opts.topBorder) {
    doc.setDrawColor(...C.accent);
    doc.setLineWidth(0.3);
    doc.line(x, y, x + w, y);
  }
  doc.setFont("helvetica", opts.bold ? "bold" : "normal");
  doc.setFontSize(7);
  doc.setTextColor(opts.bold ? 20 : 50, opts.bold ? 20 : 50, opts.bold ? 20 : 50);
  doc.text(label, x + 2 + (opts.indent ?? 0), y + 3.8);
  if (amount !== null) {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.text(inr(amount), x + w - 2, y + 3.8, { align: "right" });
  }
  return y + LINE_H;
}

export async function generateBalanceSheetPdf(data: BalanceSheetResult): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  await ensureNotoSansRegistered(doc);

  // Dynamically import PDF_COLORS
  const { PDF_COLORS: C } = await import("@shared/letterhead");

  let y = drawLetterhead(doc, {
    pageWidth: PAGE_W,
    margin: MARGIN,
    title: "BALANCE SHEET",
    bannerSubtitle: `As of ${data.asOf}`,
  });

  y += 2;

  // Balance check banner
  if (!data.balanced) {
    doc.setFillColor(254, 243, 199);
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(180, 100, 0);
    doc.text("! Balance sheet does not balance — verify equity and opening balance entries.", MARGIN + 2, y + 4);
    y += 8;
  }

  const colW = COL_W;

  // ── LEFT COLUMN: ASSETS ──────────────────────────────────────────────────────
  let ly = y;
  let ry = y;

  // Non-Current Assets
  ly = drawSectionHeader(doc, MARGIN, ly, colW, "Non-Current Assets", C);
  data.assets.nonCurrent.forEach(section => {
    ly = drawRow(doc, MARGIN, ly, colW, section.label, null, { bold: true, C });
    section.children.forEach(c => {
      ly = drawRow(doc, MARGIN, ly, colW, c.label, c.amount, { indent: 4, shade: true, C });
    });
  });
  ly = drawRow(doc, MARGIN, ly, colW, "Total Non-Current Assets", data.assets.totalNonCurrentAssets, { bold: true, topBorder: true, C });
  ly += 2;

  // Current Assets
  ly = drawSectionHeader(doc, MARGIN, ly, colW, "Current Assets", C);
  data.assets.current.forEach((section, i) => {
    ly = drawRow(doc, MARGIN, ly, colW, section.label, section.amount, { shade: i % 2 === 0, C });
    section.children.forEach(c => {
      ly = drawRow(doc, MARGIN, ly, colW, c.label, c.amount, { indent: 4, shade: true, C });
    });
  });
  ly = drawRow(doc, MARGIN, ly, colW, "Total Current Assets", data.assets.totalCurrentAssets, { bold: true, topBorder: true, C });
  ly += 2;

  // TOTAL ASSETS
  doc.setFillColor(...C.accent);
  doc.rect(MARGIN, ly, colW, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C.white);
  doc.text("TOTAL ASSETS", MARGIN + 2, ly + 4.8);
  doc.text(inr(data.assets.totalAssets), MARGIN + colW - 2, ly + 4.8, { align: "right" });
  ly += 9;

  // ── RIGHT COLUMN: LIABILITIES + EQUITY ───────────────────────────────────────

  // Current Liabilities
  ry = drawSectionHeader(doc, COL2_X, ry, colW, "Current Liabilities", C);
  data.liabilities.current.forEach((section, i) => {
    ry = drawRow(doc, COL2_X, ry, colW, section.label, section.amount, { shade: i % 2 === 0, C });
    section.children.forEach(c => {
      ry = drawRow(doc, COL2_X, ry, colW, `  ${c.label}`, c.amount, { indent: 4, shade: true, C });
    });
  });
  ry = drawRow(doc, COL2_X, ry, colW, "Total Current Liabilities", data.liabilities.totalCurrentLiabilities, { bold: true, topBorder: true, C });
  ry += 2;

  // Non-Current Liabilities
  ry = drawSectionHeader(doc, COL2_X, ry, colW, "Non-Current Liabilities", C);
  if (data.liabilities.nonCurrent.length === 0) {
    ry = drawRow(doc, COL2_X, ry, colW, "Nil", 0, { C });
  } else {
    data.liabilities.nonCurrent.forEach((section, i) => {
      ry = drawRow(doc, COL2_X, ry, colW, section.label, section.amount, { shade: i % 2 === 0, C });
      section.children.forEach(c => {
        ry = drawRow(doc, COL2_X, ry, colW, `  ${c.label}`, c.amount, { indent: 4, shade: true, C });
      });
    });
  }
  ry = drawRow(doc, COL2_X, ry, colW, "Total Non-Current Liabilities", data.liabilities.totalNonCurrentLiabilities, { bold: true, topBorder: true, C });
  ry += 2;

  // TOTAL LIABILITIES
  doc.setFillColor(230, 235, 245);
  doc.rect(COL2_X, ry, colW, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 80);
  doc.text("TOTAL LIABILITIES", COL2_X + 2, ry + 4);
  doc.text(inr(data.liabilities.totalLiabilities), COL2_X + colW - 2, ry + 4, { align: "right" });
  ry += 8;

  // Equity
  ry = drawSectionHeader(doc, COL2_X, ry, colW, "Equity", C);
  data.equity.lines.forEach((line, i) => {
    ry = drawRow(doc, COL2_X, ry, colW, line.label, line.amount, { shade: i % 2 === 0, C });
    if (line.note) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6);
      doc.setTextColor(120, 120, 140);
      doc.text(line.note, COL2_X + 6, ry - 1.2);
    }
  });
  ry = drawRow(doc, COL2_X, ry, colW, "Total Equity", data.equity.totalEquity, { bold: true, topBorder: true, C });
  ry += 2;

  // TOTAL LIABILITIES + EQUITY
  doc.setFillColor(...C.accent);
  doc.rect(COL2_X, ry, colW, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C.white);
  doc.text("TOTAL LIABILITIES + EQUITY", COL2_X + 2, ry + 4.8);
  doc.text(inr(data.totalLiabilitiesAndEquity), COL2_X + colW - 2, ry + 4.8, { align: "right" });
  ry += 9;

  // Balanced indicator
  const finalY = Math.max(ly, ry) + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  if (data.balanced) {
    doc.setTextColor(22, 163, 74);
    doc.text("> Balance sheet balances: Assets = Liabilities + Equity", MARGIN, finalY);
  } else {
    doc.setTextColor(220, 60, 60);
    doc.text("! Balance sheet does NOT balance — check equity and opening balance entries.", MARGIN, finalY);
  }

  // Footer
  const footerY = 287;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(150, 150, 160);
  doc.text(
    `Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST  |  M/s Hussain Enterprise`,
    PAGE_W / 2, footerY, { align: "center" },
  );

  return doc.output("arraybuffer") as unknown as Uint8Array;
}
