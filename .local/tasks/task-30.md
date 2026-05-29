---
title: Task #30 — Reports Module: CSV, Excel & PDF Export (Web + Capacitor Android)
---
# Task #30 — Reports Module: CSV, Excel & PDF Export

## Objective
Make the currently non-functional "Export All" and "Generate Report" buttons in the Reports module
produce real downloadable files. Three data tabs (AP Aging, AR Aging, Daily Pricing) get per-tab
CSV and PDF export. The Overview tab gets a PDF summary. No new npm packages needed.

---

## Approach

### CSV/Excel exports
Pure browser implementation — no library required.
- Build a helper: `exportCSV(filename: string, headers: string[], rows: string[][])`
- Creates a Blob, URL.createObjectURL, triggers an `<a>` click, then revokes the URL
- CSV files open directly in Microsoft Excel and Google Sheets with full column recognition

### PDF exports
Use jsPDF (already at `"jspdf": "^4.2.0"`) — same style as existing `quotation-pdf.ts` and
`purchase-order-pdf.ts`. Create `client/src/lib/reports-pdf.ts` with shared helpers.

---

## Files to Create
- `client/src/lib/reports-pdf.ts` — PDF generation helpers for Reports

## Files to Modify
- `client/src/pages/Reports.tsx` — wire up all export buttons

---

## Detailed Implementation

### 1. Shared export utilities (in Reports.tsx or a lib file)

```typescript
// CSV helper
function downloadCSV(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const escape = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

### 2. AP Aging Tab
Add two buttons in the filter bar: "CSV" and "PDF"

**CSV columns** (from current filtered + shown rows, respecting supplier filter + showPaid toggle):
Supplier | Invoice # | PO # | Invoice Date | Due Date | Total (₹) | Paid (₹) | Balance (₹) | Days Overdue | Bucket | Status

**PDF layout** (in reports-pdf.ts → `generateAPAgingPDF`):
- Navy header: "ITFI Group — AP Aging Report" + generated date
- Summary band: 5 aging bucket totals + Total Outstanding
- Data table: same columns as CSV
- Footer: page number

### 3. AR Aging Tab
Same pattern as AP Aging.

**CSV columns**:
Customer | Type | GSTIN | Invoice # | Invoice Date | Due Date | Grand Total (₹) | Paid (₹) | Balance (₹) | Days Overdue | Bucket | Status

**PDF**: `generateARAgingPDF` in reports-pdf.ts

### 4. Daily Pricing Tab (admin/sales_manager/accountant only)
**CSV columns**:
Product | SKU | Category | Stock | Blended Cost (₹) | Global Floor (₹) | Strict Floor (₹) | Confirmed Price (₹) | Margin % | Pressure Level | Source | Pricing Status | Sell Priority

**PDF**: `generatePricingPDF` in reports-pdf.ts
- Header: "ITFI Group — Daily Pricing Report" + date
- Portfolio summary band: 4 portfolio card values
- Product table with colour-coded Pressure column

### 5. "Export All" button at the top of Reports page
Convert the current static "Export All" button to a dropdown:
```
[ Download ▾ ]
  ├── Export Current Tab as CSV
  └── Export Current Tab as PDF
```
Use Shadcn DropdownMenu. The button reads the current active tab value to call the correct export.
This requires lifting the tab `value` state from `<Tabs defaultValue="overview">` to a `useState` in the
parent `Reports` component and passing a `setActiveExport` callback, or use a ref.

### 6. Overview tab "Generate Report" cards
Each of the 6 overview cards currently has a static "Generate Report" button.
- "Sales Report", "Financial Report" → show a toast: "Coming soon — data pipelines not yet connected"
- "Inventory Report" → link to the Inventory page
- "Staff Report" → link to the Employee page  
- "Project Report" → link to the Projects page
- "Tax Report" → trigger a combined PDF export that includes the AP Aging + AR Aging data on one report

---

## Button placement in each tab
- **AP Aging / AR Aging**: add two icon buttons to the right of the filter bar:
  - `<Button variant="outline" size="sm"><FileText /> PDF</Button>`
  - `<Button variant="outline" size="sm"><Download /> CSV</Button>`
- **Daily Pricing**: same two buttons next to the existing search/filter controls

## File naming convention
- `itfi-ap-aging-YYYY-MM-DD.csv`
- `itfi-ap-aging-YYYY-MM-DD.pdf`
- `itfi-ar-aging-YYYY-MM-DD.csv`
- `itfi-ar-aging-YYYY-MM-DD.pdf`
- `itfi-daily-pricing-YYYY-MM-DD.csv`
- `itfi-daily-pricing-YYYY-MM-DD.pdf`

---

## Acceptance Criteria
- [ ] AP Aging CSV downloads with correct columns and data matching current filter state
- [ ] AP Aging PDF downloads with header, summary band, and data table
- [ ] AR Aging CSV and PDF work identically
- [ ] Daily Pricing CSV and PDF work (only shown to authorized roles)
- [ ] "Export All" button becomes a dropdown (CSV / PDF for current tab)
- [ ] Overview "Generate Report" cards: coming-soon toast or navigation for unimplemented stubs
- [ ] All file names include today's date
- [ ] No new npm packages required