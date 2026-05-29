/**
 * Phase 4C — Shared letterhead constants for ALL PDF generation
 * (client-side jsPDF + server-side jsPDF). Single source of truth for
 * company identity, banking, signatory, and theme palette.
 *
 * RULE: never inline these constants in any PDF generator file.
 * If a value changes, update it here and every PDF reflows.
 */

export const COMPANY = {
  name:    "Hussain Enterprise",
  shortName: "Hussain Enterprise",
  gstin:   "18AMYPN1891LZO",
  phone:   "+91 9365647772",
  email:   "info@hussainenterprise.cloud",
  website: "erp.hussainenterprise.cloud",
  address: "Rangagorah Huz, PO: Haibargaon, Nagaon, Assam, India, PIN: 782002",
  addressShort: "Rangagorah Huz, Haibargaon, Nagaon — 782002, Assam",
  tagline: "Enterprise Resource Planning",
} as const;

export const SHIP_TO =
  "Hussain Enterprise\n" +
  "Rangagorah Huz, PO: Haibargaon\n" +
  "Nagaon — 782002, Assam\n" +
  "GSTIN: 18AMYPN1891LZO";

export const SIGNATORY = {
  name:        "Authorised Signatory",
  designation: "For M/s Hussain Enterprise",
} as const;

export const BANKING = [
  {
    bank:   "HDFC Bank",
    holder: "HUSSAIN ENTERPRISE",
    branch: "Haibargaon, Nagaon",
    acNo:   "99999365647772",
    ifsc:   "HDFC0002036",
  },
  {
    bank:   "State Bank of India",
    holder: "HUSSAIN ENTERPRISE",
    branch: "Nagaon",
    acNo:   "44833748463",
    ifsc:   "SBIN0000146",
  },
] as const;

// ─── ITFI details preserved for future restoration ──────────────────────────
// name:    "IT Futuristic Industries Pvt. Ltd."
// shortName: "ITFI Group"
// gstin:   "18AAICI6408B1ZR"
// phone:   "+91 80115 35537"
// email:   "info@itfi.co.in"
// website: "www.itfi.co.in"
// address: "Dag No: 471, Patta Number: 250, Goroimaria Pathar Aibheti, Nagaon: 782002, Assam"
// SIGNATORY: "For IT Futuristic Industries Pvt. Ltd."
// BANKING holder: "IT FUTURISTIC INDUSTRIES PVT. LTD."
// HDFC acNo: 99999365647772 | IFSC: HDFC0002036
// SBI  acNo: 44833748463    | IFSC: SBIN0000146

/** Shared theme palette — RGB tuples for jsPDF setFillColor/setTextColor/setDrawColor */
export const PDF_COLORS = {
  headerBg:      [30, 41, 59]    as [number, number, number], // navy
  headerText:    [255, 255, 255] as [number, number, number],
  headerSubText: [180, 190, 210] as [number, number, number],
  accent:        [59, 130, 246]  as [number, number, number], // blue
  textPrimary:   [15, 23, 42]    as [number, number, number],
  textSecondary: [100, 116, 139] as [number, number, number],
  tableBorder:   [226, 232, 240] as [number, number, number],
  tableHeader:   [241, 245, 249] as [number, number, number],
  tableAltBg:    [248, 250, 252] as [number, number, number],
  white:         [255, 255, 255] as [number, number, number],
  infoBg:        [248, 250, 252] as [number, number, number],
  summaryBg:     [239, 246, 255] as [number, number, number],
  draftRed:      [220, 38, 38]   as [number, number, number],
  cancelRed:     [185, 28, 28]   as [number, number, number],
  watermarkRed:  [220, 53, 69]   as [number, number, number],
  watermarkGray: [150, 150, 150] as [number, number, number],
  dividerMid:    [203, 213, 225] as [number, number, number],
  amber:         [180, 83, 9]    as [number, number, number],
  green:         [4, 120, 87]    as [number, number, number],
} as const;
