/**
 * Phase 4C — Shared letterhead constants for ALL PDF generation
 * (client-side jsPDF + server-side jsPDF). Single source of truth for
 * company identity, banking, signatory, and theme palette.
 *
 * RULE: never inline these constants in any PDF generator file.
 * If a value changes, update it here and every PDF reflows.
 */

export const COMPANY = {
  name:    "IT Futuristic Industries Pvt. Ltd.",
  shortName: "ITFI Group",
  gstin:   "18AAICI6408B1ZR",
  phone:   "+91 80115 35537",
  email:   "info@itfi.co.in",
  website: "www.itfi.co.in",
  address: "Dag No: 471, Patta Number: 250, Goroimaria Pathar Aibheti, Nagaon: 782002, Assam",
  addressShort: "Dag No: 471, Goroimaria Pathar Aibheti, Nagaon — 782002, Assam",
  tagline: "Enterprise Resource Planning",
} as const;

export const SHIP_TO =
  "IT Futuristic Industries Pvt. Ltd.\n" +
  "Dag No: 471, Goroimaria Pathar Aibheti\n" +
  "Nagaon — 782002, Assam\n" +
  "GSTIN: 18AAICI6408B1ZR";

export const SIGNATORY = {
  name:        "Authorised Signatory",
  designation: "For IT Futuristic Industries Pvt. Ltd.",
} as const;

export const BANKING = [
  {
    bank:   "HDFC Bank",
    holder: "IT FUTURISTIC INDUSTRIES PVT. LTD.",
    branch: "Haibargaon, Nagaon",
    acNo:   "99999365647772",
    ifsc:   "HDFC0002036",
  },
  {
    bank:   "State Bank of India",
    holder: "IT FUTURISTIC INDUSTRIES PVT. LTD.",
    branch: "Nagaon",
    acNo:   "44833748463",
    ifsc:   "SBIN0000146",
  },
] as const;

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
