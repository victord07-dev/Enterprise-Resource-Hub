# Daily Pricing UI + Sales Integration

## What & Why
The lot engine and pricing backend are only useful if staff can see and act on them. This task builds the Daily Pricing tab in Inventory, the full pricing dialog with approval controls, a discount simulation tool in both Pricing and Sales, and ensures the product unit price becomes read-only in the Products module whenever a confirmed price sheet exists.

## Done looks like
- **Inventory → Daily Pricing tab**: Table listing all products with a price sheet today. Columns: Product, Primary Supplier Price, Blended Cost, Global Floor, Strict Floor, Proposed Price, Status, Actions. Badges show `needs_pricing_review` flag.
- **Pricing Dialog** (opened per product): Shows the lot breakdown table (GRN #, received date, remaining qty, landed cost, lot floor, proposed price input). Summary footer shows blended cost, global floor, strict floor. Proposed price input turns red if below strict floor and yellow if below global floor. Submit/Confirm/Reject buttons appropriate to the user's role.
- **Discount Simulation panel** (in both Pricing Dialog and Sales quotation/order form): Input qty + proposed price → output: margin %, whether it clears global floor, whether it clears strict floor. Color-coded result (green/yellow/red).
- **Product unit price lock**: In the Products module, `unitPrice` field is read-only with a tooltip if a confirmed price sheet exists for today. Sales and quotation forms show the effective price from the pricing engine (today's confirmed or yesterday's fallback) when adding a line item, with a visual indicator if no confirmed price exists yet.
- **Pressure indicator**: Each product row in Daily Pricing shows a pressure badge: cost/marketPrice > 0.9 = High Risk (red), > 0.75 = Medium (yellow), ≤ 0.75 = Safe (green).
- **Sell priority flag**: Products with stock age > 30 days AND qty > minStockLevel show a fire icon in the Daily Pricing and Inventory lists.

## Out of scope
- Automated notifications and cron jobs.
- Portfolio-level margin summary report (Task #25).
- Mobile / kiosk pricing views.

## Tasks
1. **Daily Pricing tab in Inventory** — Add a "Daily Pricing" tab to the Inventory page. Fetch today's effective price sheets for all products. Display the table with all columns, pressure badges, and sell priority flags. Wire an "Add Sheet" button for products with no sheet today.

2. **Pricing dialog** — Build a full-screen dialog showing the lot breakdown table and the approval workflow controls (submit / confirm with override check / reject). Show a warning banner when `overrideRequired` is true and require override reason text before confirming.

3. **Discount simulation panel** — Build a reusable component that takes qty + price inputs and calls the lot engine data to compute margin % and floor checks. Embed it in the Pricing Dialog and in the Sales Order / Quotation item form as a collapsible panel on each line item.

4. **Product price lock + effective price in sales forms** — In Products admin, make `unitPrice` read-only when a confirmed sheet exists today. In Sales Order and Quotation item forms, auto-populate unit price from the effective price API rather than product.unitPrice, and show a warning badge if today's price is not yet confirmed.

## Relevant files
- `client/src/pages/Inventory.tsx`
- `client/src/pages/Products.tsx`
- `client/src/pages/Sales.tsx`
- `shared/schema.ts`
- `server/routes.ts`
