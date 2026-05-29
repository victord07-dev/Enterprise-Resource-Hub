---
title: Task #25 (Revised) — Margin Engine & Pricing Reports: Correctness Fixes + Actionable Insights
---
# Task #25 (Revised) — Margin Engine & Pricing Reports: Correctness Fixes + Actionable Insights

## Objective
Fix 5 concrete bugs in the existing Reports Daily Pricing tab + `/api/reports/pricing-summary` endpoint,
where the original implementation diverged from the tightened spec introduced by Tasks #26 and #27.
Then add the missing "Actionable Insights" panel to the UI.

## Background
The current implementation built most of #25 already. However:
- Task #26 introduced per-product `minMarginPct` — the pricing-summary ignores it (uses hardcoded 5%)
- Task #27 introduced `source: "today"|"fallback"|"none"` — pricing-summary doesn't return it
- The spec requires excluding unpriced products from expectedRevenue — current code doesn't do this
- High Risk threshold uses hardcoded 0.9/0.75 costRatio instead of per-product minMarginPct

---

## Server Changes — `server/routes.ts`

### Fix 1: Fetch `min_margin_pct` from products query
In the `pricing-summary` endpoint (around line 5355), add `p.min_margin_pct` to the SQL SELECT:
```sql
SELECT p.id, p.name, p.sku, p.category, p.unit, p.unit_price, p.cost_price,
       p.min_stock_level, p.needs_pricing_review, p.min_margin_pct,
       COALESCE(SUM(s.quantity), 0)::numeric AS total_stock
FROM products p ...
```

### Fix 2: Derive `source` field per product
After sheetMap lookup, derive:
- `source = "today"` if sheetDate === today
- `source = "fallback"` if sheetDate exists but is before today
- `source = "none"` if no confirmed sheet within 7 days

### Fix 3: Exclude source="none" products from expectedRevenue
```javascript
// Only include confirmed-priced products in revenue projection
if (source !== "none" && blendedCost > 0 && totalStock > 0) {
  portfolioRevenue += confirmedPrice * totalStock;
}
// Always include in totalCost (the cost is real regardless of pricing)
if (blendedCost > 0 && totalStock > 0) {
  portfolioTotalCost += blendedCost * totalStock;
}
```

### Fix 4: Fix requiredRevenue to use per-product minMarginPct
Replace the hardcoded formula with per-product globalFloor:
```javascript
const minMarginPct = Number(prod.min_margin_pct ?? 5);
const globalFloor = blendedCost > 0 ? blendedCost * (1 + minMarginPct / 100) : 0;
// Portfolio rollup
if (blendedCost > 0 && totalStock > 0) {
  portfolioRequiredRevenue += globalFloor * totalStock;
}
```

### Fix 5: Fix pressureLevel to use per-product minMarginPct
Replace hardcoded ratio (0.9/0.75) with marginPct vs minMarginPct comparison:
```javascript
// marginPct here is gross margin = (price - cost) / price * 100 (existing formula — keep it)
const pressureLevel =
  marginPct === null ? "None"
  : marginPct < minMarginPct ? "High Risk"           // below product's minimum margin floor
  : marginPct < (minMarginPct + 10) ? "Medium"       // within 10 percentage points of floor
  : "Safe";
```
Threshold examples: minMarginPct=5 → High Risk <5%, Medium 5-15%, Safe ≥15%.
minMarginPct=15 → High Risk <15%, Medium 15-25%, Safe ≥25%.

### Fix 6: Add `source` and `minMarginPct` to per-product response
In the products.push():
```javascript
source,         // "today" | "fallback" | "none"
minMarginPct,
```

### Fix 7: Add `productsWithoutPriceCount` to portfolio response
```javascript
productsWithoutPriceCount: products.filter(p => p.source === "none").length,
```

---

## UI Changes — `client/src/pages/Reports.tsx`

### Fix 8: Update PricingProduct interface
Add:
```typescript
source: "today" | "fallback" | "none";
minMarginPct: number;
```

### Fix 9: Add "Actionable Insights" panel (3 cards)
Between portfolio cards and filter controls, add a new row of 3 compact action cards:

**Card 1 — 🟡 Needs Pricing**
- Count: products where `p.needsPricingReview === true || p.source === "none"`
- Shows top 3 product names
- Clicking filters table to show only these products

**Card 2 — 🔴 High Risk Products**
- Count: `p.pressureLevel === "High Risk"`
- Shows top 3 product names
- Clicking sets atRiskOnly=true filter

**Card 3 — 🔥 Old Stock Pressure**
- Count: `p.sellPriority === true`
- Shows top 3 product names with 🔥 emoji
- Clicking filters table to show only sell-priority products

State: `activeInsight: null | "needsPricing" | "highRisk" | "sellPriority"` — controls quick filter.
Clear when user changes other filters.

### Fix 10: Add "Source" column to pricing table
Add a `Source` column after the "Today's Price" column:
- `source === "today"` → `🟢 Today`
- `source === "fallback"` → `🟡 Prev (date)` 
- `source === "none"` → `🔴 No Price` (with Needs Pricing badge)

### Fix 11: Update portfolio card footnotes
- "Revenue @ Confirmed Prices" card: if `productsWithoutPriceCount > 0`, add a small note:
  "(N without confirmed price excluded)"
- "Required @ 5% Min Margin" card: rename to "Required @ Min Margin"

---

## Files to Modify
- `server/routes.ts` — GET /api/reports/pricing-summary (lines ~5350–5482)
- `client/src/pages/Reports.tsx` — DailyPricingTab component (lines ~522–777)

## Business Rules Compliance
- ✅ Effective Price only (never product.unitPrice for revenue)
- ✅ Exclude source="none" from expectedRevenue
- ✅ FIFO blended cost for all cost-side calculations
- ✅ Per-product minMarginPct respected throughout

## Acceptance Criteria
- [ ] `requiredRevenue` uses per-product `minMarginPct` (not hardcoded 5%)
- [ ] Products with `source="none"` excluded from `expectedRevenue` (still in `totalCost`)
- [ ] Per-product `source` field ("today"|"fallback"|"none") in API response and shown in table
- [ ] `pressureLevel` uses `marginPct < minMarginPct` comparison (not hardcoded 0.9/0.75 ratios)
- [ ] "Actionable Insights" panel shows 3 cards with counts + top-3 product names
- [ ] Clicking insight cards filters the table below
- [ ] Portfolio revenue card shows footnote when products are excluded
- [ ] Sales order lot-margin column unchanged (already correct)