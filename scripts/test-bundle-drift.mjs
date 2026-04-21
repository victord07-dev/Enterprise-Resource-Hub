// Phase 7 B5 verification — bundle auto-price drift detection.
// Creates an auto-priced bundle with an obviously stale sellingPrice, then
// hits the public bundle-effective-price endpoint and verifies that the
// computed price differs by >5% — i.e. the cron WOULD flag it.
// We don't run the cron itself (it fires at 02:00 IST); the logic is
// identical and the cron's only extra job is updateProduct+createAuditLog.

const BASE = process.env.BASE || "http://localhost:5000";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.error("Set ADMIN_TOKEN env var"); process.exit(1); }

const STAMP = String(Date.now()).slice(-8);
const log = (...a) => console.log(...a);
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: r.status, body: parsed };
}
async function must(method, path, body, expect = 200) {
  const r = await api(method, path, body);
  if (r.status !== expect) fail(`${method} ${path} expected ${expect}, got ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body;
}

console.log("=== Phase 7 B5 drift verification ===");

const comp = await must("POST", "/api/products", {
  sku: `D-COMP-${STAMP}`, name: `Drift Comp ${STAMP}`,
  type: "physical", category: "panel", unit: "pcs",
  costPrice: "100", sellingPrice: "150", unitPrice: "150",
  lifecycleStatus: "active",
  gstRate: "18", minMarginPct: "5",
}, 201);

const bundle = await must("POST", "/api/products", {
  sku: `D-BUN-${STAMP}`, name: `Drift Bundle ${STAMP}`,
  type: "bundle", category: "kit", unit: "set",
  costPrice: "0",
  // intentionally stale baseline — way off from Σcomponents
  sellingPrice: "100", unitPrice: "100",
  lifecycleStatus: "active", gstRate: "18", minMarginPct: "5",
  pricingMode: "auto",
}, 201);

await must("PUT", `/api/products/${bundle.id}/bundle-items`, {
  items: [{ componentProductId: comp.id, quantity: "10", unit: "pcs" }],
});

const eff = await must("GET", `/api/products/${bundle.id}/bundle-effective-price`);
const computed = Number(eff.totalPrice);
const stored = 100;
const drift = Math.abs(computed - stored) / stored;

log(`stored=${stored}  computed=${computed}  drift=${(drift * 100).toFixed(2)}%`);
if (drift <= 0.05) fail("expected drift > 5% on this synthetic bundle");
log("✓ drift check would flag this bundle (>5%)");

// And the inverse — match the price exactly, drift should be 0.
const stable = await must("POST", "/api/products", {
  sku: `D-STAB-${STAMP}`, name: `Stable Bundle ${STAMP}`,
  type: "bundle", category: "kit", unit: "set",
  costPrice: "0",
  sellingPrice: String(computed), unitPrice: String(computed),
  lifecycleStatus: "active", gstRate: "18", minMarginPct: "5",
  pricingMode: "auto",
}, 201);
await must("PUT", `/api/products/${stable.id}/bundle-items`, {
  items: [{ componentProductId: comp.id, quantity: "10", unit: "pcs" }],
});
const eff2 = await must("GET", `/api/products/${stable.id}/bundle-effective-price`);
const drift2 = Math.abs(Number(eff2.totalPrice) - computed) / computed;
log(`stable bundle drift=${(drift2 * 100).toFixed(4)}%`);
if (drift2 > 0.05) fail("stable bundle unexpectedly drifted");
log("✓ stable bundle would NOT be flagged");

console.log("\n=== B5 LOGIC VERIFIED ===");
