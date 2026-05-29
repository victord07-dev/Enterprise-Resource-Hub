/**
 * Phase 4D-C — Financial Ratios PDF generator (server-side, jsPDF).
 *
 * Rules:
 *   - jsPDF manual primitives only (no autotable)
 *   - drawLetterhead from shared/pdf-letterhead.ts
 *   - NotoSans via ensureNotoSansRegistered for Rs symbol
 *   - ARROW=">" WARN_GLYPH="!" — no Unicode arrows/warn glyphs
 *   - Indian number formatting: en-IN locale
 *   - Single page layout: two ratio cards + input breakdown table
 */

import { jsPDF } from "jspdf";
import { drawLetterhead, RUPEE } from "@shared/pdf-letterhead";
import { ensureNotoSansRegistered } from "./pdf-fonts";

function inr(n: number): string {
  return RUPEE + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRatio(n: number | null): string {
  return n === null ? "N/A" : n.toFixed(2) + "x";
}

export interface FinancialRatiosData {
  asOf:             string;
  generatedAt:      string;
  currentRatio:     number | null;
  debtEquityRatio:  number | null;
  inputs: {
    currentAssets:      number;
    currentLiabilities: number;
    totalLiabilities:   number;
    totalEquity:        number;
  };
}

const PAGE_W = 210;
const MARGIN  = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Colour thresholds
function crColor(v: number | null): [number, number, number] {
  if (v === null)   return [120, 120, 140];
  if (v >= 1.5)     return [22,  163, 74];   // green
  if (v >= 1.0)     return [217, 119, 6];    // amber
  return                   [220, 60,  60];   // red
}

function derColor(v: number | null): [number, number, number] {
  if (v === null)   return [120, 120, 140];
  if (v <= 1.0)     return [22,  163, 74];
  if (v <= 2.0)     return [217, 119, 6];
  return                   [220, 60,  60];
}

function interpLabel(key: string, val: string): string {
  if (val === "healthy")        return "> Healthy";
  if (val === "warning")        return "! Caution";
  if (val === "critical")       return "! Below safe threshold";
  if (val === "high")           return "! High leverage";
  if (val === "no_liabilities") return "> No current liabilities";
  if (val === "no_equity")      return "! No equity recorded";
  return val;
}

function crInterp(v: number | null): string {
  if (v === null)  return "no_liabilities";
  if (v >= 1.5)    return "healthy";
  if (v >= 1.0)    return "warning";
  return "critical";
}

function derInterp(v: number | null): string {
  if (v === null)  return "no_equity";
  if (v <= 1.0)    return "healthy";
  if (v <= 2.0)    return "warning";
  return "high";
}

/**
 * Draw a single ratio card.
 * Returns the Y position after the card.
 */
function drawRatioCard(
  doc: any,
  x: number, y: number, w: number,
  title: string,
  formula: string,
  value: number | null,
  color: [number, number, number],
  interp: string,
  benchmark: string,
  C: any,
): number {
  const cardH = 42;

  // Card background
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, w, cardH, 2, 2, "F");

  // Left accent bar
  doc.setFillColor(...color);
  doc.rect(x, y, 3, cardH, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 60);
  doc.text(title, x + 6, y + 7);

  // Formula
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 120);
  doc.text(formula, x + 6, y + 13);

  // Big ratio number
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...color);
  doc.text(fmtRatio(value), x + 6, y + 30);

  // Interpretation badge (right side)
  const badgeX = x + w - 60;
  doc.setFillColor(...color);
  doc.roundedRect(badgeX, y + 8, 54, 8, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(interpLabel("", interp), badgeX + 27, y + 13.2, { align: "center" });

  // Benchmark note
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 140);
  doc.text(benchmark, x + 6, y + 38);

  return y + cardH + 4;
}

export async function generateFinancialRatiosPdf(data: FinancialRatiosData): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  await ensureNotoSansRegistered(doc);

  const { PDF_COLORS: C } = await import("@shared/letterhead");

  let y = drawLetterhead(doc, {
    pageWidth: PAGE_W,
    margin: MARGIN,
    title: "FINANCIAL RATIOS",
    bannerSubtitle: `As of ${data.asOf}`,
  });

  y += 4;

  // ── Ratio Cards ───────────────────────────────────────────────────────────────
  const cardW = (CONTENT_W - 6) / 2;

  // Current Ratio card (left)
  const crVal   = data.currentRatio;
  const crColor_ = crColor(crVal);
  const crI     = crInterp(crVal);
  y = drawRatioCard(
    doc,
    MARGIN, y, cardW,
    "Current Ratio",
    "Current Assets / Current Liabilities",
    crVal,
    crColor_,
    crI,
    "Benchmark: >= 1.5 healthy | 1.0-1.49 caution | < 1.0 critical",
    C,
  );

  // Re-set y to top of right card (both cards same row)
  const rightCardY = y - 46;   // rewind to where left card started
  drawRatioCard(
    doc,
    MARGIN + cardW + 6, rightCardY, cardW,
    "Total Liabilities / Total Equity",
    "Total Liabilities / Total Equity",
    data.debtEquityRatio,
    derColor(data.debtEquityRatio),
    derInterp(data.debtEquityRatio),
    "Benchmark: <= 1.0 healthy | 1.01-2.0 caution | > 2.0 high",
    C,
  );

  // Advance y past the taller card
  // (both cards same height so y is already correct after left card)
  y += 2;

  // ── Input Breakdown Table ─────────────────────────────────────────────────────
  // Section header
  doc.setFillColor(...C.accent);
  doc.rect(MARGIN, y, CONTENT_W, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.white);
  doc.text("INPUT BREAKDOWN", MARGIN + 2, y + 4.2);
  y += 7;

  const tableRows: [string, string, string][] = [
    ["Current Assets",      "Assets maturing / convertible within 12 months",    inr(data.inputs.currentAssets)],
    ["Current Liabilities", "Obligations due within 12 months",                  inr(data.inputs.currentLiabilities)],
    ["Total Liabilities",   "All liabilities (current + non-current)",            inr(data.inputs.totalLiabilities)],
    ["Total Equity",        "Owner's equity (share capital + retained earnings)", inr(data.inputs.totalEquity)],
  ];

  const colWidths = [44, 100, 38];
  const rowH = 6.5;

  // Table header
  doc.setFillColor(230, 235, 245);
  doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(40, 40, 80);
  doc.text("Line Item",   MARGIN + 2,                          y + 4.2);
  doc.text("Description", MARGIN + colWidths[0] + 2,           y + 4.2);
  doc.text("Amount",      MARGIN + colWidths[0] + colWidths[1] + colWidths[2] - 2, y + 4.2, { align: "right" });
  y += rowH;

  tableRows.forEach((row, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
    }
    doc.setFont("helvetica", i < 2 ? "normal" : "bold");
    doc.setFontSize(7);
    doc.setTextColor(40, 40, 60);
    doc.text(row[0], MARGIN + 2, y + 4.2);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 100);
    doc.text(row[1], MARGIN + colWidths[0] + 2, y + 4.2);
    doc.setFont("helvetica", i >= 2 ? "bold" : "normal");
    doc.setTextColor(40, 40, 60);
    doc.text(row[2], MARGIN + colWidths[0] + colWidths[1] + colWidths[2] - 2, y + 4.2, { align: "right" });
    y += rowH;
  });

  // Border around table
  doc.setDrawColor(...C.accent);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y - tableRows.length * rowH - rowH, CONTENT_W, (tableRows.length + 1) * rowH);

  y += 6;

  // ── Definitions note ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 140);
  doc.text(
    "All figures sourced from the Balance Sheet computed as of the above date. " +
    "Ratios reflect the financial position at that point in time.",
    MARGIN, y,
  );
  y += 5;

  // ── generatedAt ──────────────────────────────────────────────────────────────
  const genDt = new Date(data.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 140);
  doc.text(`Generated: ${genDt} IST`, MARGIN, y);

  // ── Footer ────────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(150, 150, 160);
  doc.text(
    `Generated ${genDt} IST  |  M/s Hussain Enterprise`,
    PAGE_W / 2, 287, { align: "center" },
  );

  return doc.output("arraybuffer") as unknown as Uint8Array;
}
