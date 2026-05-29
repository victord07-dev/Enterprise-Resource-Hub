---
title: Daily Pricing UI — Completion & Architecture Fix
---
Complete and restructure the Daily Pricing workflow with the correct module architecture, #27 bug fixes, pricing dialog improvements, and sales form UX cleanup.

  ## 1. New standalone Pricing page + sidebar entry
  - Create /pricing route and Pricing.tsx page (move all Daily Pricing tab content from Inventory.tsx here)
  - Add "Pricing" sidebar entry visible only to admin, sales_manager, accountant
  - Remove Daily Pricing tab from Inventory.tsx (warehouse staff don't need it)
  - Register new route in App.tsx

  ## 2. Bug fixes from Task #27 (in new Pricing.tsx)
  - Rejected count card: simplify to s.status === "rejected" only (remove old || (s.status === "draft" && s.rejectionNotes) fallback — causes double-counting after Task #27)
  - Toast after reject: change from "Returned to draft for revision" to "Sheet rejected — submitter can revise and resubmit"

  ## 3. Source badge + Effective Price column in Pricing table
  - Fetch /api/daily-price-sheets/effective-prices-today in Pricing.tsx
  - Each product row gains: Source badge (🟢 "Approved Today" / 🟡 "Prev Price" / 🔴 "No Price") and an Effective Price column (confirmed price sales will actually use, distinct from Proposed Price)

  ## 4. Backend — extend last-sold-prices endpoint to include date
  The only backend change in this task. The existing GET /api/products/last-sold-prices endpoint returns Record<string, string> (productId → price). Extend the response to include the sale date:
  - Change response shape to Record<string, { price: string, lastSoldAt: string }> (ISO date string)
  - The date is already being queried internally (ORDER BY created_at DESC) — just include it in the response
  - Update the Products.tsx "Last Sold" column display to still work (it reads the price field now from the nested object)

  ## 5. Pricing dialog — 6-point reference panel (2 rows × 3 cards)
  Expand the current 3 summary cards into a 2-row × 3-column reference panel, placed between the FIFO lot table and the Proposed Price input:

  Row 1 — Cost & Safety:
  | Card | Label | Value | Source |
  |---|---|---|---|
  | 1 | Avg. Landed Cost | ₹40,000 | sheet.blendedCost (rename label from "Blended Inventory Cost") |
  | 2 | Global Floor | ₹42,000 | sheet.globalFloorPrice |
  | 3 | Strict Floor | ₹42,000 | sheet.strictFloorPrice |

  Row 2 — Market Reference:
  | Card | Label | Value | Source |
  |---|---|---|---|
  | 4 | Last Sold Price | ₹48,000 · Apr 8 | /api/products/last-sold-prices (price + lastSoldAt date) |
  | 5 | Last Approved Price | ₹47,000 · Apr 12 | effectivePrice + sheetDate from effective-prices-today — show "₹47k ✓ Today" / "₹47k · Apr 12" / "Not yet approved" |
  | 6 | Current List Price | ₹50,000 | pricingProduct.unitPrice |

  With all 6 visible, staff can reason: "Stock costs ₹40k → floor ₹42k → last approved ₹47k (Apr 12) → last sold ₹48k (Apr 8) → list ₹50k → I'll propose ₹46k today."

  ## 6. Products page — read-only "Today's Prices" tab
  - Add a new "Today's Prices" tab to the Products/Services page, visible to all roles
  - Read-only table: Product | Unit | Effective Price | Source | Floor Price | Last Sold (price + date) | Status
  - Same 🟢/🟡/🔴 source badges — no actions, purely informational daily price board for the sales team
  - Data from /api/daily-price-sheets/effective-prices-today + /api/products/last-sold-prices (updated)

  ## 7. Sales / Quotation form UX
  - Replace per-line "Show/Hide Margin Simulation" collapsible toggle with a "Check Margin" button per line item that opens a compact Dialog modal (same data: source alert, margin %, floor checks)
  - Add inline chip below Unit Price input (visible without any toggle): "🟢 Floor ₹115 · Approved Today" / "🟡 Floor ₹115 · Prev (date)" / "🔴 Floor ₹115 · No Approval"

  ## 8. Notification deep-link to Pricing dialog
  - Pricing notification click navigates to /pricing?sheet=<relatedId>
  - Pricing.tsx on mount reads the ?sheet= param, finds the matching product from todaySheets, auto-opens the PricingDialog for it, then clears the param from URL

  ## Workflow after this task
  | Step | Who | Where |
  |---|---|---|
  | Enter + submit proposed price | sales_manager, accountant | /pricing |
  | See 6-point reference panel with dates | sales_manager, accountant | /pricing dialog |
  | Approve / Reject | admin/CEO | Bell → /pricing?sheet=ID |
  | View today's approved prices | all sales roles | Products → Today's Prices tab |
  | Price auto-fills in order | sales_rep | Sales/Quotation form (unchanged) |

  ## Files
  - client/src/pages/Pricing.tsx (NEW — moved from Inventory Daily Pricing tab)
  - client/src/pages/Inventory.tsx (remove Daily Pricing tab)
  - client/src/pages/Products.tsx (add Today's Prices tab; update Last Sold column for new response shape)
  - client/src/pages/Sales.tsx (Check Margin modal + inline chip)
  - client/src/App.tsx (register /pricing route)
  - Sidebar component (add Pricing nav entry)
  - Notification click handler (route to /pricing?sheet=ID)
  - server/routes.ts (extend /api/products/last-sold-prices to return { price, lastSoldAt })

  ## Out of scope
  - Additional backend changes beyond the last-sold-prices date extension
  - Mobile / kiosk pricing views
  - Automated cron for missing-approval alerts
  - Portfolio-level margin summary report (Task #25/Reports)