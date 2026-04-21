#!/usr/bin/env node
// Phase 7 B4 — integration test for atomic bundle dispatch.
// Exercises: success (3 movements), 1-component shortage, 2-component shortage.

const BASE = "http://localhost:5000";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.error("ADMIN_TOKEN env var required"); process.exit(2); }

const H = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
const STAMP = Date.now().toString().slice(-8);
const log = (...a) => console.log(...a);
const fail = (msg) => { console.error("FAIL:", msg); process.exit(1); };

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json; try { json = JSON.parse(txt); } catch { json = txt; }
  return { status: res.status, body: json };
}

async function must(method, path, body, expectStatus = 200) {
  const r = await api(method, path, body);
  if (r.status !== expectStatus) {
    fail(`${method} ${path} expected ${expectStatus}, got ${r.status}: ${JSON.stringify(r.body).slice(0, 400)}`);
  }
  return r.body;
}

async function findOrCreateCustomer() {
  const cust = await must("POST", "/api/customers", {
    name: `BundleTest Customer ${STAMP}`,
    email: `bt${STAMP}@test.local`,
    phone: "9999999999",
    customerType: "business",
  }, 201);
  return cust.id;
}

async function findOrCreateWarehouse() {
  const list = await must("GET", "/api/warehouses");
  if (Array.isArray(list) && list.length > 0) return list[0].id;
  const w = await must("POST", "/api/warehouses", { name: `BT-WH-${STAMP}`, location: "Test" }, 201);
  return w.id;
}

async function createProduct(name, type = "product") {
  const p = await must("POST", "/api/products", {
    name: `${name} ${STAMP}`,
    sku: `SKU-${name.replace(/\s/g, "")}-${STAMP}`,
    category: "Solar Equipment",
    unitPrice: "1000.00",
    unit: "pcs",
    minStockLevel: 0,
    type,
    gstRate: "18.00",
  }, 201);
  return p.id;
}

async function setStock(productId, warehouseId, quantity) {
  // Try to find existing row
  const all = await must("GET", "/api/inventory-stock");
  const existing = (all || []).find((r) => r.productId === productId && r.warehouseId === warehouseId);
  if (existing) {
    return must("PATCH", `/api/inventory-stock/${existing.id}`, { quantity });
  } else {
    return must("POST", "/api/inventory-stock", { productId, warehouseId, quantity }, 201);
  }
}

async function getMovements(productId) {
  return must("GET", `/api/stock-movements/by-product/${productId}`);
}

async function dispatchExpectError(challanId) {
  return api("POST", `/api/delivery-challans/${challanId}/dispatch`);
}

(async () => {
  log("=== Phase 7 B4 dispatch integration test ===");
  const customerId = await findOrCreateCustomer();
  const warehouseId = await findOrCreateWarehouse();
  log("customerId", customerId, "warehouseId", warehouseId);

  // 1) create 3 component products + 1 bundle
  const panelId = await createProduct("Panel");
  const litId = await createProduct("Lithium");
  const pcuId = await createProduct("PCU");
  const bundleId = await createProduct("SolarKit", "bundle");
  log("components:", { panelId, litId, pcuId }, "bundle:", bundleId);

  // 2) set bundle items: panel x2, lithium x1, pcu x1 per bundle
  await must("PUT", `/api/products/${bundleId}/bundle-items`, {
    items: [
      { componentProductId: panelId, quantity: 2, unit: "pcs" },
      { componentProductId: litId, quantity: 1, unit: "pcs" },
      { componentProductId: pcuId, quantity: 1, unit: "pcs" },
    ],
  });
  log("bundle items set");

  // 3) seed plenty of stock for the components
  await setStock(panelId, warehouseId, 100);
  await setStock(litId, warehouseId, 100);
  await setStock(pcuId, warehouseId, 100);
  log("stock seeded: 100 each");

  let orderSeq = 0;
  // helper — create order + challan with bundle qty 1
  async function newOrderWithChallan() {
    orderSeq++;
    const order = await must("POST", "/api/sales-orders", {
      orderNumber: `BT-${STAMP}-${orderSeq}`,
      customerId,
      status: "pending",
      totalAmount: "5000.00",
      // schema accepts Date object via z.coerce — but JSON only sends strings; the route does
      // not coerce orderDate (only expectedDeliveryDate). Server defaults orderDate so omit it.
      warehouseId,
    }, 201);
    log("  order created", order.id, order.orderNumber);
    {
      const r = await api("POST", `/api/sales-orders/${order.id}/items`, {
        items: [{
          productId: bundleId,
          description: "SolarKit bundle",
          quantity: 1,
          unitPrice: "5000",
          totalPrice: "5000",
          itemType: "bundle",
          gstRate: "18",
          hsnCode: "",
        }],
      });
      if (r.status !== 200 && r.status !== 201) fail(`add items got ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    }

    // challan needs items list referencing the bundle product directly
    const challan = await must("POST", "/api/delivery-challans", {
      orderId: order.id,
      customerId,
      sourceType: "warehouse",
      sourceId: warehouseId,
      items: [{
        productId: bundleId,
        description: "SolarKit bundle",
        quantity: 1,
        qtyOrdered: "1",
        qtyReserved: "1",
        qtyToDispatch: "1",
        qtyDispatched: "0",
        unitPrice: "5000",
      }],
    }, 201);
    log("  challan created", challan.id, challan.challanNumber);
    return challan.id;
  }

  // ============================================================
  // TEST 1 — happy path: dispatch creates 3 stock_movements (or more if FIFO splits)
  // ============================================================
  log("\n--- TEST 1: happy-path dispatch ---");
  const c1 = await newOrderWithChallan();
  const before1 = {
    panel: (await getMovements(panelId)).length,
    lit: (await getMovements(litId)).length,
    pcu: (await getMovements(pcuId)).length,
  };
  await must("POST", `/api/delivery-challans/${c1}/dispatch`);
  const after1 = {
    panel: (await getMovements(panelId)).length,
    lit: (await getMovements(litId)).length,
    pcu: (await getMovements(pcuId)).length,
  };
  const delta1 = { panel: after1.panel - before1.panel, lit: after1.lit - before1.lit, pcu: after1.pcu - before1.pcu };
  log("  movement deltas", delta1);
  if (delta1.panel < 1 || delta1.lit < 1 || delta1.pcu < 1) fail(`expected ≥1 movement per component, got ${JSON.stringify(delta1)}`);
  // verify reference_type = bundle_dispatch on the new movement
  const mvs = await getMovements(panelId);
  const bd = mvs.find((m) => m.referenceType === "bundle_dispatch");
  if (!bd) fail("expected at least one movement with referenceType='bundle_dispatch' for panel");
  log("  ✓ bundle_dispatch movement found:", bd.notes);

  // ============================================================
  // TEST 2 — 1-component shortage (panel needs 2, only 1 available)
  // ============================================================
  log("\n--- TEST 2: 1-component shortage ---");
  await setStock(panelId, warehouseId, 1);   // shortage
  await setStock(litId, warehouseId, 100);
  await setStock(pcuId, warehouseId, 100);
  const c2 = await newOrderWithChallan();
  const before2 = (await getMovements(panelId)).length;
  const r2 = await dispatchExpectError(c2);
  if (r2.status !== 400) fail(`expected 400, got ${r2.status}: ${JSON.stringify(r2.body)}`);
  if (!r2.body.shortages || r2.body.shortages.length !== 1) fail(`expected 1 shortage, got ${JSON.stringify(r2.body.shortages)}`);
  if (r2.body.shortages[0].productId !== panelId) fail(`expected panel shortage, got ${r2.body.shortages[0].productId}`);
  const after2 = (await getMovements(panelId)).length;
  if (after2 !== before2) fail(`expected NO new movements (atomic rollback), but ${after2 - before2} were created`);
  log("  ✓ shortage:", r2.body.shortages[0]);
  log("  ✓ no movements written (atomic)");

  // ============================================================
  // TEST 3 — 2-component shortage (panel + lithium)
  // ============================================================
  log("\n--- TEST 3: 2-component shortage ---");
  await setStock(panelId, warehouseId, 0);
  await setStock(litId, warehouseId, 0);
  await setStock(pcuId, warehouseId, 100);
  const c3 = await newOrderWithChallan();
  const before3 = {
    panel: (await getMovements(panelId)).length,
    lit: (await getMovements(litId)).length,
  };
  const r3 = await dispatchExpectError(c3);
  if (r3.status !== 400) fail(`expected 400, got ${r3.status}: ${JSON.stringify(r3.body)}`);
  if (!r3.body.shortages || r3.body.shortages.length !== 2) fail(`expected 2 shortages, got ${JSON.stringify(r3.body.shortages)}`);
  const ids = r3.body.shortages.map((s) => s.productId).sort();
  const want = [panelId, litId].sort();
  if (JSON.stringify(ids) !== JSON.stringify(want)) fail(`shortage productIds mismatch: ${JSON.stringify(ids)} vs ${JSON.stringify(want)}`);
  const after3 = {
    panel: (await getMovements(panelId)).length,
    lit: (await getMovements(litId)).length,
  };
  if (after3.panel !== before3.panel || after3.lit !== before3.lit) fail("expected NO new movements on rollback");
  log("  ✓ both shortages reported:");
  for (const s of r3.body.shortages) log("    -", s.productName, "need", s.required, "have", s.available, "context", s.bundleContext);
  log("  ✓ no movements written (atomic)");

  log("\n=== ALL TESTS PASSED ===");
})().catch((e) => { console.error("UNCAUGHT", e); process.exit(1); });
