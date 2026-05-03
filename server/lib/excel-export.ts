/**
 * Phase 4C — ExcelJS wrapper for server-side report exports.
 *
 * Standard layout:
 *   Row 1: Company name (bold, large)
 *   Row 2: Report title (bold)
 *   Row 3: Period / filter line (italic, muted)
 *   Row 4: Generated-at timestamp
 *   Row 5: blank
 *   Row 6: column headers (bold, gray bg)
 *   Row 7+: data rows
 *   Last row: TOTALS (bold, top-border)
 *
 * Indian currency formatting via #,##0.00 (Excel renders en-IN comma grouping
 * via locale; if accountant opens in non-IN Excel, the number is still correct).
 *
 * Supports optional second sheet (e.g. invoice-level detail under summary).
 */

import ExcelJS from "exceljs";
import { COMPANY } from "@shared/letterhead";

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
  /** 'currency' formats as Indian rupee, 'date' as dd-mmm-yyyy, 'number' as integer, 'pct' as percent */
  type?: "currency" | "date" | "number" | "pct" | "text";
}

export interface SheetSpec {
  name: string;
  title: string;
  /** e.g. "Period: 01 Apr 2026 → 30 Apr 2026" */
  subtitle?: string;
  columns: SheetColumn[];
  rows: Array<Record<string, unknown>>;
  /** If supplied, renders as last row in bold with top border. */
  totals?: Record<string, unknown>;
  /**
   * Header layout style:
   *   'full'    — 6-row block: Co name / Title / Subtitle / Generated / blank / column headers (default).
   *   'compact' — 3-row hybrid (operator-locked Q2): Row1 merged title block (Co + Title + Subtitle on one line),
   *               Row2 column headers (pivot-friendly), Row3+ data. Use for new Phase 4C reports.
   */
  headerStyle?: "full" | "compact";
}

const HEADER_FILL = "FFF1F5F9";
const TOTAL_FILL = "FFEFF6FF";
const BORDER_COLOR = "FFCBD5E1";
const CURRENCY_FMT = "#,##,##0.00";   // Indian lakh/crore grouping
const DATE_FMT = "dd-mmm-yyyy";
const PCT_FMT = "0.00%";

function applyTitleBlock(ws: ExcelJS.Worksheet, title: string, subtitle?: string) {
  const colSpan = Math.max(4, ws.columnCount || 4);
  ws.mergeCells(1, 1, 1, colSpan);
  const r1 = ws.getCell(1, 1);
  r1.value = COMPANY.name;
  r1.font = { bold: true, size: 14 };
  r1.alignment = { horizontal: "left", vertical: "middle" };

  ws.mergeCells(2, 1, 2, colSpan);
  const r2 = ws.getCell(2, 1);
  r2.value = title;
  r2.font = { bold: true, size: 12, color: { argb: "FF1E293B" } };

  if (subtitle) {
    ws.mergeCells(3, 1, 3, colSpan);
    const r3 = ws.getCell(3, 1);
    r3.value = subtitle;
    r3.font = { italic: true, size: 10, color: { argb: "FF64748B" } };
  }

  ws.mergeCells(4, 1, 4, colSpan);
  const r4 = ws.getCell(4, 1);
  r4.value = `Generated: ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} | GSTIN: ${COMPANY.gstin}`;
  r4.font = { size: 9, color: { argb: "FF94A3B8" } };
}

function applyHeaderRow(ws: ExcelJS.Worksheet, columns: SheetColumn[], rowNum: number) {
  columns.forEach((col, idx) => {
    const cell = ws.getCell(rowNum, idx + 1);
    cell.value = col.header;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: ["currency","number","pct"].includes(col.type ?? "") ? "right" : "left", vertical: "middle" };
    cell.border = {
      top:    { style: "thin", color: { argb: BORDER_COLOR } },
      bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    };
  });
}

function setCellByType(cell: ExcelJS.Cell, value: unknown, type?: SheetColumn["type"]) {
  if (value === null || value === undefined || value === "") {
    cell.value = "";
    return;
  }
  switch (type) {
    case "currency": {
      const n = Number(value);
      cell.value = isFinite(n) ? n : 0;
      cell.numFmt = CURRENCY_FMT;
      cell.alignment = { horizontal: "right" };
      break;
    }
    case "number": {
      const n = Number(value);
      cell.value = isFinite(n) ? n : 0;
      cell.numFmt = "#,##0";
      cell.alignment = { horizontal: "right" };
      break;
    }
    case "pct": {
      const n = Number(value);
      cell.value = isFinite(n) ? n / 100 : 0;
      cell.numFmt = PCT_FMT;
      cell.alignment = { horizontal: "right" };
      break;
    }
    case "date": {
      cell.value = value instanceof Date ? value : new Date(String(value));
      cell.numFmt = DATE_FMT;
      break;
    }
    default:
      cell.value = String(value);
  }
}

function applyCompactTitleBlock(ws: ExcelJS.Worksheet, title: string, subtitle?: string) {
  const colSpan = Math.max(2, ws.columnCount || 2);
  ws.mergeCells(1, 1, 1, colSpan);
  const r1 = ws.getCell(1, 1);
  // Hybrid 3-row header (Q2): pack Company + Report Name + Period into row 1.
  // Column headers move to row 2 — pivot tables select from row 2 down cleanly.
  r1.value = subtitle
    ? `${COMPANY.name}  •  ${title}  •  ${subtitle}`
    : `${COMPANY.name}  •  ${title}`;
  r1.font = { bold: true, size: 12, color: { argb: "FF1E293B" } };
  r1.alignment = { horizontal: "left", vertical: "middle", wrapText: false };
  ws.getRow(1).height = 22;
}

function buildSheet(wb: ExcelJS.Workbook, spec: SheetSpec): ExcelJS.Worksheet {
  const compact = spec.headerStyle === "compact";
  // Pivot-safety (architect HIGH): keep a blank row between the merged title
  // (row 1) and the column headers so Excel's "current region" auto-detect
  // does not pull the title into pivot source range. Layout in compact mode:
  //   Row 1 = merged title  |  Row 2 = blank  |  Row 3 = headers  |  Row 4+ = data
  const headerRow = compact ? 3 : 6;
  const dataStartRow = compact ? 4 : 7;

  const ws = wb.addWorksheet(spec.name, {
    views: [{ state: "frozen", ySplit: headerRow }],
  });
  ws.columns = spec.columns.map(c => ({
    key: c.key,
    width: c.width ?? 18,
  }));

  if (compact) {
    applyCompactTitleBlock(ws, spec.title, spec.subtitle);
  } else {
    applyTitleBlock(ws, spec.title, spec.subtitle);
  }
  applyHeaderRow(ws, spec.columns, headerRow);

  let r = dataStartRow;
  spec.rows.forEach((row) => {
    spec.columns.forEach((col, idx) => {
      const cell = ws.getCell(r, idx + 1);
      setCellByType(cell, row[col.key], col.type);
    });
    r++;
  });

  if (spec.totals) {
    spec.columns.forEach((col, idx) => {
      const cell = ws.getCell(r, idx + 1);
      setCellByType(cell, spec.totals![col.key], col.type);
      cell.font = { bold: true, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
      cell.border = {
        top:    { style: "medium", color: { argb: "FF1E293B" } },
        bottom: { style: "thin",   color: { argb: BORDER_COLOR } },
      };
    });
  }

  // Auto-fit subtitle/title spans to column count
  return ws;
}

export interface BuildExcelArgs {
  sheets: SheetSpec[];
}

/**
 * Build an Excel workbook buffer ready to stream as response.
 */
export async function buildExcelBuffer(args: BuildExcelArgs): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.shortName + " ERP";
  wb.created = new Date();

  for (const spec of args.sheets) {
    buildSheet(wb, spec);
  }
  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr as ArrayBuffer);
}

/**
 * Send an Excel buffer as an HTTP download. Sets Content-Disposition.
 */
export function sendExcel(res: any, buf: Buffer, filename: string): void {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(buf.length));
  res.end(buf);
}
