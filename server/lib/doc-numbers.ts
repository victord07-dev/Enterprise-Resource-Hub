/**
 * ITFI financial-year document numbering helpers.
 *
 * India FY: April 1 – March 31.
 *   May 2026  → "2026-27"
 *   Feb 2027  → "2026-27"
 *   April 2027 → "2027-28"
 *
 * Formats:
 *   Quotation    ITFI-Q/2026-27/0001
 *   Sales Order  ITFI-SO/2026-27/0001
 *   Purchase Order ITFI-PO/2026-27/0001
 */

/** Returns the India financial-year string for a given date, e.g. "2026-27". */
export function getFinancialYear(date: Date = new Date()): string {
  const month = date.getMonth() + 1; // 1 = Jan
  const year = date.getFullYear();
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

/**
 * Given a list of existing document numbers and a prefix + FY string,
 * returns the next zero-padded 4-digit sequence number.
 *
 * Example: prefix="ITFI-Q", fyStr="2026-27"
 *   Matches strings like "ITFI-Q/2026-27/0042"
 *   Returns "ITFI-Q/2026-27/0043"
 */
export function nextDocNumber(
  prefix: string,
  fyStr: string,
  existingNumbers: (string | null | undefined)[],
): string {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedFy = fyStr.replace(/-/g, "\\-");
  const pattern = new RegExp(`^${escapedPrefix}\\/${escapedFy}\\/(\\d+)$`);
  let max = 0;
  for (const num of existingNumbers) {
    if (!num) continue;
    const m = num.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}/${fyStr}/${String(max + 1).padStart(4, "0")}`;
}
