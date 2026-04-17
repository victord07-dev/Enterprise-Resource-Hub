export interface CommonMergeField {
  key: string;
  label: string;
  example: string;
  description?: string;
}

export const COMMON_MERGE_FIELDS: CommonMergeField[] = [
  { key: "customer_name", label: "Customer name", example: "Jane Doe", description: "Name on the customer or lead record" },
  { key: "contact_person", label: "Contact person", example: "Jane Doe", description: "Primary contact on the customer record" },
  { key: "company_name", label: "Company name", example: "Acme Pvt Ltd", description: "Lead's company (leads only)" },
  { key: "phone", label: "Phone number", example: "+91 98765 43210" },
  { key: "email", label: "Email address", example: "jane@example.com" },
  { key: "address", label: "Address", example: "12 MG Road, Bengaluru" },
  { key: "gst_number", label: "GST number", example: "29ABCDE1234F1Z5" },
  { key: "order_number", label: "Order number", example: "ORD-1024" },
  { key: "invoice_number", label: "Invoice number", example: "INV-2026-001" },
  { key: "quote_number", label: "Quotation number", example: "QT-2026-014" },
  { key: "amount", label: "Amount", example: "₹5,000" },
  { key: "balance_due", label: "Balance due", example: "₹2,500" },
  { key: "due_date", label: "Due date", example: "15 Apr 2026" },
  { key: "payment_link", label: "Payment link", example: "https://example.com/pay" },
  { key: "status", label: "Status", example: "Confirmed" },
];

export const MERGE_FIELD_BY_KEY: Record<string, CommonMergeField> = Object.fromEntries(
  COMMON_MERGE_FIELDS.map(f => [f.key, f])
);

export function isCommonMergeField(key: string | null | undefined): boolean {
  if (!key) return false;
  return Object.prototype.hasOwnProperty.call(MERGE_FIELD_BY_KEY, key);
}

export function exampleForMergeField(key: string | null | undefined): string | null {
  if (!key) return null;
  const field = MERGE_FIELD_BY_KEY[key];
  return field ? field.example : null;
}

/**
 * Resolve a known merge-field key against a per-recipient context (customer or lead).
 * Returns null when the field cannot be resolved from the available context.
 * Fields that depend on order/invoice/quote context (amount, dates, links) are not
 * resolvable from a customer/lead alone and return null so the sender's manual value
 * is used instead.
 */
export interface MergeFieldDocumentContext {
  type?: "order" | "invoice" | "quote" | null;
  orderNumber?: string | null;
  invoiceNumber?: string | null;
  quoteNumber?: string | null;
  amount?: string | number | null;
  balanceDue?: string | number | null;
  dueDate?: string | Date | null;
  paymentLink?: string | null;
  status?: string | null;
}

export interface MergeFieldContext {
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    gstNumber?: string | null;
    contactPerson?: string | null;
  } | null;
  lead?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    gstNumber?: string | null;
    company?: string | null;
  } | null;
  document?: MergeFieldDocumentContext | null;
}

function formatAmount(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Returns a short, human-readable label describing where a known merge-field key
 * would be auto-filled from. Used by the WhatsApp send dialogs to tell operators
 * whether a variable came from the document, the customer record, or the lead.
 * Returns null for unknown keys.
 */
export function mergeFieldSourceLabel(
  key: string,
  docType?: "order" | "invoice" | "quote" | null,
): string | null {
  switch (key) {
    case "customer_name":
    case "contact_person":
    case "phone":
    case "email":
    case "address":
    case "gst_number":
      return "customer";
    case "company_name":
      return "lead";
    case "order_number":
      return "order";
    case "invoice_number":
      return "invoice";
    case "quote_number":
      return "quote";
    case "amount":
    case "balance_due":
    case "due_date":
    case "payment_link":
    case "status":
      return docType || "document";
    default:
      return null;
  }
}

export function resolveMergeField(key: string, ctx: MergeFieldContext): string | null {
  const c = ctx.customer || null;
  const l = ctx.lead || null;
  const d = ctx.document || null;
  switch (key) {
    case "customer_name":
      return c?.name || l?.name || null;
    case "contact_person":
      return c?.contactPerson || c?.name || l?.name || null;
    case "company_name":
      return l?.company || null;
    case "phone":
      return c?.phone || l?.phone || null;
    case "email":
      return c?.email || l?.email || null;
    case "address":
      return c?.address || l?.address || null;
    case "gst_number":
      return c?.gstNumber || l?.gstNumber || null;
    case "order_number":
      return d?.orderNumber || null;
    case "invoice_number":
      return d?.invoiceNumber || null;
    case "quote_number":
      return d?.quoteNumber || null;
    case "amount":
      return formatAmount(d?.amount ?? null);
    case "balance_due":
      return formatAmount(d?.balanceDue ?? null);
    case "due_date":
      return formatDate(d?.dueDate ?? null);
    case "payment_link":
      return d?.paymentLink || null;
    case "status":
      return d?.status || null;
    default:
      return null;
  }
}
