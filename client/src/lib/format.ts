/**
 * Phase 4C — Shared formatting helpers (currency, dates, numbers).
 * Use everywhere on the client: tables, dialogs, PDFs, exports.
 */

/** Indian Rupee with ₹ symbol and lakh/crore comma grouping. */
export function fmtINR(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "—";
  const n = Number(val);
  if (!isFinite(n)) return "—";
  return "\u20B9" + n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Indian Rupee number only (no symbol) for spreadsheet cells / PDF table cells. */
export function fmtAmount(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "—";
  const n = Number(val);
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** PDF-safe rupee using `Rs.` prefix (some jsPDF Helvetica builds choke on ₹). */
export function fmtRsPdf(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "—";
  const n = Number(val);
  if (!isFinite(n)) return "—";
  return "Rs. " + n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** dd Mon yyyy (en-IN). */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** dd Mon yyyy, HH:mm */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Today as `dd Mon yyyy`. */
export function todayFmt(): string {
  return fmtDate(new Date());
}

/** ISO date (yyyy-mm-dd) for query params. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Percentage formatter: 12.5 → "12.50%". */
export function fmtPct(val: number | string | null | undefined, digits = 2): string {
  if (val === null || val === undefined || val === "") return "—";
  const n = Number(val);
  if (!isFinite(n)) return "—";
  return n.toFixed(digits) + "%";
}
