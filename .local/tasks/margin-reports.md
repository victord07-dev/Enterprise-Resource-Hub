# Margin Engine & Pricing Reports

## What & Why
Once daily pricing is live, management needs a high-level view of portfolio health: are we selling above cost across all lots? Which products are under margin pressure? This task adds portfolio-level margin analysis, a pricing report page, and the business intelligence indicators that turn lot and pricing data into decisions.

## Done looks like
- **Reports → Daily Pricing Report tab**: Table of all products showing today's confirmed price, blended cost, global floor, strict floor, margin %, pressure indicator, and whether the product has unconfirmed sheets.
- **Portfolio margin summary**: A card at the top showing total inventory cost vs. total revenue at confirmed prices, required revenue at min margin %, and a SAFE / AT RISK status indicator.
- **Lot-level margin on Sales**: Each dispatched sales order item (in the order detail view) shows the estimated lot margin % based on FIFO cost at the time of dispatch.
- **API `GET /api/reports/pricing-summary`**: Returns per-product margin data and a portfolio rollup for the report page.

## Out of scope
- Historical margin trend charts (future enhancement).
- Integration with payroll or commission calculation.
- Automated margin alerts via SMS or email.

## Tasks
1. **Pricing summary API** — Build `GET /api/reports/pricing-summary` that calls the lot engine for each active product, fetches today's effective price, and returns per-product margin data (margin %, pressure level, sell priority) plus a portfolio-level rollup (total cost, revenue at confirmed prices, required revenue at min margin %).

2. **Reports page — Daily Pricing tab** — Add a "Daily Pricing" tab to the Reports page showing the per-product table and the portfolio summary cards. Include a product filter and a "Show only at-risk" toggle.

3. **Lot margin on dispatched orders** — In the Sales Order detail view, annotate each dispatched line item with an estimated margin % computed from the FIFO lot cost at dispatch time (read from stock_movements grnId → GRN lot landed cost).

## Relevant files
- `client/src/pages/Reports.tsx`
- `client/src/pages/Sales.tsx`
- `server/routes.ts`
- `shared/schema.ts`
