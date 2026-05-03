/**
 * Phase 4C P6-EXTENDED — Shared letterhead drawing helper.
 *
 * Single source of truth for ALL PDF letterheads (client + server, jsPDF).
 * Use `drawLetterhead(doc, opts)` instead of inlining header rectangles
 * + COMPANY text in each generator. Returns the y-coordinate where body
 * content should start drawing.
 *
 * Companion: `client/src/lib/pdf-fonts.ts` (lazy fetch) and
 * `server/lib/pdf-fonts.ts` (sync read) register NotoSans so the ₹ symbol
 * and Greek/em-dash render correctly. Both also monkey-patch doc.setFont
 * to transparently redirect "helvetica" → "NotoSans" for any existing code.
 *
 * NotoSans (Latin/Greek/Cyrillic subset) covers ₹, Δ, em-dash but NOT
 * → (Arrows) or ⚠ (Misc Symbols). Use ARROW and WARN_GLYPH constants
 * below in any new PDF strings instead of those Unicode codepoints.
 */

import { COMPANY, PDF_COLORS } from "./letterhead";

// Unicode-safe substitutes for glyphs missing from NotoSans Latin-Greek-Cyrillic.
// Use these in PDF source strings instead of literal → and ⚠.
export const ARROW = ">";
export const WARN_GLYPH = "!";
export const EM_DASH = "\u2014"; // — (covered by NotoSans, safe to use)
export const RUPEE = "\u20b9";   // ₹ (covered by NotoSans, safe to use)

export interface LetterheadOptions {
  /** Page width in mm (210 portrait A4, 297 landscape A4). */
  pageWidth: number;
  /** Left/right margin in mm. Defaults to 12. */
  margin?: number;
  /** Title to render in the blue accent banner (e.g. "QUOTATION", "Profit & Loss Statement"). */
  title: string;
  /** Optional logo data URL (PNG/JPEG). When omitted, COMPANY.name is rendered as wordmark. */
  logoDataUrl?: string;
  /**
   * Optional subtitle drawn right-aligned in the blue banner (e.g. report period or doc date).
   * Useful for reports that previously squeezed period/date into the navy band.
   */
  bannerSubtitle?: string;
  /**
   * Whether to draw the blue accent banner with the title. Defaults to true.
   * Set false only if the caller wants the navy header band alone (rare).
   */
  drawBanner?: boolean;
}

/**
 * Draws the canonical ITFI letterhead and returns the y-coordinate where
 * body content should start drawing.
 *
 * Layout (variant: full):
 *   [0-30 mm]   navy header band — logo (or wordmark) on left, full
 *               company name + address + phone + email + website + GSTIN
 *               on right (right-aligned)
 *   [30-38 mm]  blue accent banner with TITLE (auto-shrinks to fit)
 *   [38+ mm]    body content
 *
 * Returns 43 (= 30 + 8 + 5 mm body padding) when banner is drawn,
 * else 35 (= 30 + 5 mm padding).
 */
export function drawLetterhead(doc: any, opts: LetterheadOptions): number {
  const C = PDF_COLORS;
  const margin = opts.margin ?? 12;
  const pageWidth = opts.pageWidth;
  const drawBanner = opts.drawBanner !== false;

  // ── Navy header band (30 mm tall) ─────────────────────────────────────────
  const headerH = 30;
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, pageWidth, headerH, "F");

  // Left: logo (82 × 18 mm, vertically centred) OR COMPANY.name wordmark
  const logoW = 82;
  const logoH = 18;
  const logoY = (headerH - logoH) / 2;
  let drewLogo = false;
  if (opts.logoDataUrl) {
    try {
      doc.addImage(opts.logoDataUrl, "PNG", margin, logoY, logoW, logoH);
      drewLogo = true;
    } catch {
      // fall through to wordmark
    }
  }
  if (!drewLogo) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...C.headerText);
    doc.text(COMPANY.name, margin, headerH / 2 + 2);
  }

  // Right column: COMPANY.name + address line 1 + Phone/Email/Website/GSTIN
  const rx = pageWidth - margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(220, 230, 248);
  doc.text(COMPANY.name, rx, 5.5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(180, 190, 210);
  const addrLines = doc.splitTextToSize(COMPANY.address, 82);
  doc.text(addrLines[0], rx, 9.5, { align: "right" });

  doc.setFontSize(6);
  doc.text(`Phone: ${COMPANY.phone}`, rx, 14, { align: "right" });
  doc.text(COMPANY.email,             rx, 18, { align: "right" });
  doc.text(COMPANY.website,           rx, 22, { align: "right" });
  doc.text(`GSTIN: ${COMPANY.gstin}`, rx, 26, { align: "right" });

  if (!drawBanner) {
    return headerH + 5;
  }

  // ── Blue accent banner (8 mm tall) with TITLE ────────────────────────────
  const bannerY = headerH;
  doc.setFillColor(...C.accent);
  doc.rect(0, bannerY, pageWidth, 8, "F");

  // Auto-shrink title size if it would overflow the banner width
  doc.setFont("helvetica", "bold");
  let titleSize = 10;
  doc.setFontSize(titleSize);
  const subWidth = opts.bannerSubtitle ? doc.getTextWidth(opts.bannerSubtitle) + 4 : 0;
  const maxTitleWidth = pageWidth - margin * 2 - subWidth * 2;
  while (doc.getTextWidth(opts.title) > maxTitleWidth && titleSize > 7) {
    titleSize -= 0.5;
    doc.setFontSize(titleSize);
  }
  doc.setTextColor(...C.white);
  doc.text(opts.title, pageWidth / 2, bannerY + 5.5, { align: "center" });

  if (opts.bannerSubtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.white);
    doc.text(opts.bannerSubtitle, pageWidth - margin, bannerY + 5.5, { align: "right" });
  }

  return bannerY + 8 + 5; // 5 mm body padding after banner
}

/**
 * Format a Date as "01 Apr 2026" — used by report PDFs in period strings.
 * Centralised so all PDFs render dates identically.
 */
export function fmtPdfDate(d: Date | string | null | undefined): string {
  if (!d) return EM_DASH;
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return EM_DASH;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Format a period range as "01 Apr 2026 > 03 May 2026" (uses ARROW for
 * NotoSans Latin/Greek/Cyrillic compatibility).
 */
export function fmtPdfPeriod(from: string | Date | null, to: string | Date | null): string {
  return `Period: ${fmtPdfDate(from)} ${ARROW} ${to ? fmtPdfDate(to) : "Today"}`;
}
