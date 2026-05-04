import { pool } from "../db";

  const MIGRATION_SQL = `-- ============================================================
-- ITFI Production Kit Migration
-- Generated: 2026-05-04T08:34:35.744Z
-- Products: 3 missing components + 14 kits
-- Bundle links: 271
-- SKU remaps:
--   ITFI-EARTHING-E-G  → OTH-ERTH-ELEC-GI      (id: 8fef13ca-5f66-4313-ab96-86a20810020e)
--   OTH-MTR-5-30HPL   → OTH-MTR-5-30HPL-1PH   (id: 440aeed0-aaf2-4c65-8eab-540697226d93)
-- ============================================================

BEGIN;

-- STEP 1: Insert 3 missing component products
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('5bff1899-391f-4a50-9aaa-8ef5d1db16a8', 'ITFI-LM-550WP', 'LUMINOUS 550WP BIFICIAL Panel', 'Solar Panel / PV Module', 14727.00, 'pcs', 10, 'product', '85414300', 5.00, false, 5.00, 'active', 'manual', 'others')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('a615d1f8-3df9-418a-b4dd-0d7acbbb84f5', 'SLX-INV-3KW-1P', 'SOLEX Inverter 3KW 1Phase', 'Solar Panel / PV Module', 18500.00, 'pcs', 10, 'product', '85414300', 5.00, false, 5.00, 'active', 'manual', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('5275d4eb-9cfb-4e13-836a-2a5bc68c5fb1', 'TATA-525WP-BI-P', 'TATA 525WP BIFICIAL Panel', 'Solar Panel / PV Module', 14614.00, 'pcs', 10, 'product', '85414300', 5.00, false, 5.00, 'active', 'manual', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;

-- STEP 2: Insert 14 kit products (type=bundle, pricing_mode=auto)
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', 'ITFI-ADANI-4KW-FULLKIT', 'Adani 4KW Full Kit', 'Solar Panel / PV Module', 151084.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('0744e7d0-c7d6-4042-86dc-a40f36f5710f', 'ITFI-ADANI-4KW-HALFKIT', 'Adani 4KW Half Kit', 'Solar Panel / PV Module', 139974.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', 'ITFI-ADANI-5KW-FULLKIT', 'Adani 5KW Full Kit', 'Solar Panel / PV Module', 168802.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('460c4ed7-8c39-4d89-8db9-a8e2ae94a0ff', 'ITFI-ADANI-5KW-HALFKIT', 'Adani 5KW Half Kit', 'Solar Panel / PV Module', 157178.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'ITFI-EST-3KW-FULL-KIT', 'EASTMAN 3KW FULL KIT', 'Solar Panel / PV Module', 106759.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('4127197b-3873-45e6-96ca-0acaed2af3ab', 'ITFI-EST-3KW-HALF-KIT', 'EASTMAN 3KW HALF KIT', 'Solar Panel / PV Module', 98229.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', 'ITFI-LM-3KW-FULL-KIT', 'LUMINOUS 3KW FULL KIT', 'Solar Panel / PV Module', 115428.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('fc7e7807-ce5e-420e-96ae-b36fd4c3f21b', 'ITFI-LM-3KW-HALF-KIT', 'LUMINOUS 3KW HALF KIT', 'Solar Panel / PV Module', 106891.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'ITFI-TATA-3KW-FULL-KIT', 'TATA 3KW FULL KIT', 'Solar Panel / PV Module', 118260.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('c162484c-674a-47f3-95bd-72212d35bded', 'ITFI-TATA-3KW-HALF-KIT', 'TATA 3KW HALF KIT', 'Solar Panel / PV Module', 109501.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', 'ITFI-WAR-3KW-FULL-KIT', 'WAAREE 3KW FULL KIT', 'Solar Panel / PV Module', 116601.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('3c2c9f02-c34e-48fd-a170-f46d1fbd61f7', 'ITFI-WAR-3KW-HALF-KIT', 'WAAREE 3KW HALF KIT', 'Solar Panel / PV Module', 108071.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', 'ITFI-WEBSL-3KW-FULL-KIT', 'WEBSOLE 3KW FULL KIT', 'Solar Panel / PV Module', 95706.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;
INSERT INTO products (id, sku, name, category, unit_price, unit, min_stock_level, type, hsn_code, gst_rate, needs_pricing_review, min_margin_pct, lifecycle_status, pricing_mode, grid_type)
  VALUES ('5a268d99-4b9f-45de-a8b0-5f0d6272c1fc', 'ITFI-WEBSL-3KW-HALF-KIT', 'WEBSOLE 3KW HALF KIT', 'Solar Panel / PV Module', 86959.00, 'pcs', 0, 'bundle', '85414300', 5.00, true, 5.00, 'active', 'auto', 'on_grid')
  ON CONFLICT (sku) DO NOTHING;

-- STEP 3: Bundle component links (271 rows)
-- Uses production product IDs for both kit and component
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '2098050e-ddcd-4e01-bd34-e66b97e18543', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '4253cb25-5ad7-40c8-8746-84ea7175b4e1', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', 'bd16ddf0-3c3b-409f-a25b-672409b4e51c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '440aeed0-aaf2-4c65-8eab-540697226d93', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '86725718-76c2-4202-bed7-731302540466', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', 'cbf81286-834c-4ca6-bda3-cdff2b5be64f', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '2a539284-b7a6-43cc-b70a-c3e5458af01b', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', 'f9fb689e-233e-45ab-973e-4425124507f0', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', 'c0758c26-320b-4721-9858-a6926b685e4a', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', 'ca97916e-49f5-45a1-8efc-c9f131900871', 5)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '27c5a1f2-6284-4579-9fd7-8040f79d8e96', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '0b5e5f46-40ee-47d3-948a-50b03d932ba7', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '269c5d25-37ab-4969-ae2e-2c8ce375f81a', 7)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '178a1dec-16a6-4bf0-a2b2-e2d043227b4d', 8)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', 'f916a1b9-8c8f-4a4a-a61c-6500980b795f', 10)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '19706698-6537-42c9-bc5a-b81cc321c975', 12)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', 'a16d4a16-4a21-4899-847b-e298cf8b70ef', 14)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '9b7c7011-b49b-464b-bc5b-09c7589d73a4', 18)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', 'bed17549-9ca5-434a-a90c-9bd4bfe63117', 20)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '9c58214c-684e-45d6-a2fb-aecd1636572e', 30)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '980ed62e-3263-4c30-94f5-2375742ceff1', 36)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', 'c535144c-9a60-4c68-bc6e-4385d3fb7d4f', 45)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '055120d5-5cf7-44e6-a82c-9541add63e03', 50)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', '84c4f0cb-a5df-4581-9866-5f1cfe36584a', 60)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4f10ceee-e3ee-4bf1-9549-418ce1557c2e', 'a6e50dca-cc98-45f4-adf8-1f53923b04b6', 60)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0744e7d0-c7d6-4042-86dc-a40f36f5710f', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0744e7d0-c7d6-4042-86dc-a40f36f5710f', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0744e7d0-c7d6-4042-86dc-a40f36f5710f', '4253cb25-5ad7-40c8-8746-84ea7175b4e1', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0744e7d0-c7d6-4042-86dc-a40f36f5710f', 'bd16ddf0-3c3b-409f-a25b-672409b4e51c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0744e7d0-c7d6-4042-86dc-a40f36f5710f', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0744e7d0-c7d6-4042-86dc-a40f36f5710f', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0744e7d0-c7d6-4042-86dc-a40f36f5710f', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0744e7d0-c7d6-4042-86dc-a40f36f5710f', 'c0758c26-320b-4721-9858-a6926b685e4a', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0744e7d0-c7d6-4042-86dc-a40f36f5710f', '269c5d25-37ab-4969-ae2e-2c8ce375f81a', 7)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0744e7d0-c7d6-4042-86dc-a40f36f5710f', '178a1dec-16a6-4bf0-a2b2-e2d043227b4d', 8)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '215f1e1c-58f8-4455-950f-0bdc8f4c020c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '324c0f50-5a72-43b1-9ded-b412440721e3', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '86725718-76c2-4202-bed7-731302540466', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', 'a87aa055-9728-4645-a4f0-df8e569bc3e5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '440aeed0-aaf2-4c65-8eab-540697226d93', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', 'cbf81286-834c-4ca6-bda3-cdff2b5be64f', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '2a539284-b7a6-43cc-b70a-c3e5458af01b', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', 'f9fb689e-233e-45ab-973e-4425124507f0', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '0b5e5f46-40ee-47d3-948a-50b03d932ba7', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '27c5a1f2-6284-4579-9fd7-8040f79d8e96', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', 'ca97916e-49f5-45a1-8efc-c9f131900871', 7)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '008982f3-24c2-4f01-a317-f998d85b29c9', 10)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', 'f916a1b9-8c8f-4a4a-a61c-6500980b795f', 10)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '19706698-6537-42c9-bc5a-b81cc321c975', 12)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '0e1c4ec6-dc12-4504-822f-b8a4f8e51c63', 15)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', 'a16d4a16-4a21-4899-847b-e298cf8b70ef', 18)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', 'bed17549-9ca5-434a-a90c-9bd4bfe63117', 20)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '980ed62e-3263-4c30-94f5-2375742ceff1', 22)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '9b7c7011-b49b-464b-bc5b-09c7589d73a4', 22)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', 'dbc0e33e-e772-41bd-8b48-5f62b2a4b6c4', 22)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '9c58214c-684e-45d6-a2fb-aecd1636572e', 30)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '055120d5-5cf7-44e6-a82c-9541add63e03', 50)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', '84c4f0cb-a5df-4581-9866-5f1cfe36584a', 60)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', 'a6e50dca-cc98-45f4-adf8-1f53923b04b6', 60)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0445b9d9-e326-4712-b77a-aaf92b49744d', 'c535144c-9a60-4c68-bc6e-4385d3fb7d4f', 65)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('460c4ed7-8c39-4d89-8db9-a8e2ae94a0ff', 'a87aa055-9728-4645-a4f0-df8e569bc3e5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('460c4ed7-8c39-4d89-8db9-a8e2ae94a0ff', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('460c4ed7-8c39-4d89-8db9-a8e2ae94a0ff', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('460c4ed7-8c39-4d89-8db9-a8e2ae94a0ff', '324c0f50-5a72-43b1-9ded-b412440721e3', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('460c4ed7-8c39-4d89-8db9-a8e2ae94a0ff', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('460c4ed7-8c39-4d89-8db9-a8e2ae94a0ff', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('460c4ed7-8c39-4d89-8db9-a8e2ae94a0ff', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('460c4ed7-8c39-4d89-8db9-a8e2ae94a0ff', '008982f3-24c2-4f01-a317-f998d85b29c9', 10)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('460c4ed7-8c39-4d89-8db9-a8e2ae94a0ff', '0e1c4ec6-dc12-4504-822f-b8a4f8e51c63', 15)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '2098050e-ddcd-4e01-bd34-e66b97e18543', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'a55919c6-0bf1-4b5e-aa32-7742d1c22222', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '86725718-76c2-4202-bed7-731302540466', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '440aeed0-aaf2-4c65-8eab-540697226d93', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'bd16ddf0-3c3b-409f-a25b-672409b4e51c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'cbf81286-834c-4ca6-bda3-cdff2b5be64f', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '2a539284-b7a6-43cc-b70a-c3e5458af01b', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '0e1c4ec6-dc12-4504-822f-b8a4f8e51c63', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '0b5e5f46-40ee-47d3-948a-50b03d932ba7', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '27c5a1f2-6284-4579-9fd7-8040f79d8e96', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'f9fb689e-233e-45ab-973e-4425124507f0', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'ca97916e-49f5-45a1-8efc-c9f131900871', 5)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'd10a262c-6d6f-4bfb-8f01-c361bca5d67c', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'f916a1b9-8c8f-4a4a-a61c-6500980b795f', 8)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'a16d4a16-4a21-4899-847b-e298cf8b70ef', 10)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '19706698-6537-42c9-bc5a-b81cc321c975', 12)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '980ed62e-3263-4c30-94f5-2375742ceff1', 14)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '9b7c7011-b49b-464b-bc5b-09c7589d73a4', 14)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'dbc0e33e-e772-41bd-8b48-5f62b2a4b6c4', 14)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'bed17549-9ca5-434a-a90c-9bd4bfe63117', 20)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '9c58214c-684e-45d6-a2fb-aecd1636572e', 30)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '84c4f0cb-a5df-4581-9866-5f1cfe36584a', 33)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'c535144c-9a60-4c68-bc6e-4385d3fb7d4f', 35)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', '055120d5-5cf7-44e6-a82c-9541add63e03', 50)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('0e2e2c98-0af5-4a5b-8bc8-ee9c983e2925', 'a6e50dca-cc98-45f4-adf8-1f53923b04b6', 50)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4127197b-3873-45e6-96ca-0acaed2af3ab', 'a55919c6-0bf1-4b5e-aa32-7742d1c22222', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4127197b-3873-45e6-96ca-0acaed2af3ab', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4127197b-3873-45e6-96ca-0acaed2af3ab', 'bd16ddf0-3c3b-409f-a25b-672409b4e51c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4127197b-3873-45e6-96ca-0acaed2af3ab', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4127197b-3873-45e6-96ca-0acaed2af3ab', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4127197b-3873-45e6-96ca-0acaed2af3ab', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4127197b-3873-45e6-96ca-0acaed2af3ab', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4127197b-3873-45e6-96ca-0acaed2af3ab', '0e1c4ec6-dc12-4504-822f-b8a4f8e51c63', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('4127197b-3873-45e6-96ca-0acaed2af3ab', 'd10a262c-6d6f-4bfb-8f01-c361bca5d67c', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '2098050e-ddcd-4e01-bd34-e66b97e18543', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '44affbcf-612b-4774-8ee8-d477353df397', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', 'bd16ddf0-3c3b-409f-a25b-672409b4e51c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '440aeed0-aaf2-4c65-8eab-540697226d93', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '86725718-76c2-4202-bed7-731302540466', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', 'cbf81286-834c-4ca6-bda3-cdff2b5be64f', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '0b5e5f46-40ee-47d3-948a-50b03d932ba7', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '0e1c4ec6-dc12-4504-822f-b8a4f8e51c63', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '2a539284-b7a6-43cc-b70a-c3e5458af01b', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', 'f9fb689e-233e-45ab-973e-4425124507f0', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '27c5a1f2-6284-4579-9fd7-8040f79d8e96', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', 'ca97916e-49f5-45a1-8efc-c9f131900871', 5)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '5bff1899-391f-4a50-9aaa-8ef5d1db16a8', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', 'f916a1b9-8c8f-4a4a-a61c-6500980b795f', 8)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', 'a16d4a16-4a21-4899-847b-e298cf8b70ef', 10)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '19706698-6537-42c9-bc5a-b81cc321c975', 12)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '9b7c7011-b49b-464b-bc5b-09c7589d73a4', 14)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', 'bed17549-9ca5-434a-a90c-9bd4bfe63117', 20)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '980ed62e-3263-4c30-94f5-2375742ceff1', 28)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '9c58214c-684e-45d6-a2fb-aecd1636572e', 30)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '84c4f0cb-a5df-4581-9866-5f1cfe36584a', 33)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', 'c535144c-9a60-4c68-bc6e-4385d3fb7d4f', 35)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', '055120d5-5cf7-44e6-a82c-9541add63e03', 50)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('a2c452f8-054d-4ad8-aa91-4614b5abcade', 'a6e50dca-cc98-45f4-adf8-1f53923b04b6', 50)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('fc7e7807-ce5e-420e-96ae-b36fd4c3f21b', 'bd16ddf0-3c3b-409f-a25b-672409b4e51c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('fc7e7807-ce5e-420e-96ae-b36fd4c3f21b', '44affbcf-612b-4774-8ee8-d477353df397', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('fc7e7807-ce5e-420e-96ae-b36fd4c3f21b', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('fc7e7807-ce5e-420e-96ae-b36fd4c3f21b', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('fc7e7807-ce5e-420e-96ae-b36fd4c3f21b', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('fc7e7807-ce5e-420e-96ae-b36fd4c3f21b', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('fc7e7807-ce5e-420e-96ae-b36fd4c3f21b', '0e1c4ec6-dc12-4504-822f-b8a4f8e51c63', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('fc7e7807-ce5e-420e-96ae-b36fd4c3f21b', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('fc7e7807-ce5e-420e-96ae-b36fd4c3f21b', '5bff1899-391f-4a50-9aaa-8ef5d1db16a8', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '86725718-76c2-4202-bed7-731302540466', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '2098050e-ddcd-4e01-bd34-e66b97e18543', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '440aeed0-aaf2-4c65-8eab-540697226d93', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'bd16ddf0-3c3b-409f-a25b-672409b4e51c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'a615d1f8-3df9-418a-b4dd-0d7acbbb84f5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'cbf81286-834c-4ca6-bda3-cdff2b5be64f', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '2a539284-b7a6-43cc-b70a-c3e5458af01b', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '0e1c4ec6-dc12-4504-822f-b8a4f8e51c63', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '0b5e5f46-40ee-47d3-948a-50b03d932ba7', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'f9fb689e-233e-45ab-973e-4425124507f0', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '27c5a1f2-6284-4579-9fd7-8040f79d8e96', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'ca97916e-49f5-45a1-8efc-c9f131900871', 5)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '5275d4eb-9cfb-4e13-836a-2a5bc68c5fb1', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'f916a1b9-8c8f-4a4a-a61c-6500980b795f', 8)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'a16d4a16-4a21-4899-847b-e298cf8b70ef', 10)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '19706698-6537-42c9-bc5a-b81cc321c975', 12)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '9b7c7011-b49b-464b-bc5b-09c7589d73a4', 14)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'bed17549-9ca5-434a-a90c-9bd4bfe63117', 20)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'dbc0e33e-e772-41bd-8b48-5f62b2a4b6c4', 28)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '980ed62e-3263-4c30-94f5-2375742ceff1', 28)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '9c58214c-684e-45d6-a2fb-aecd1636572e', 30)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '84c4f0cb-a5df-4581-9866-5f1cfe36584a', 33)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'c535144c-9a60-4c68-bc6e-4385d3fb7d4f', 35)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', 'a6e50dca-cc98-45f4-adf8-1f53923b04b6', 50)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b823b15f-5dd6-488d-afc3-37e97e6256fd', '055120d5-5cf7-44e6-a82c-9541add63e03', 50)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('c162484c-674a-47f3-95bd-72212d35bded', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('c162484c-674a-47f3-95bd-72212d35bded', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('c162484c-674a-47f3-95bd-72212d35bded', 'a615d1f8-3df9-418a-b4dd-0d7acbbb84f5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('c162484c-674a-47f3-95bd-72212d35bded', 'bd16ddf0-3c3b-409f-a25b-672409b4e51c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('c162484c-674a-47f3-95bd-72212d35bded', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('c162484c-674a-47f3-95bd-72212d35bded', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('c162484c-674a-47f3-95bd-72212d35bded', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('c162484c-674a-47f3-95bd-72212d35bded', '5275d4eb-9cfb-4e13-836a-2a5bc68c5fb1', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '7662f360-d224-45de-b7f2-1fde43ce59ac', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '86725718-76c2-4202-bed7-731302540466', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '440aeed0-aaf2-4c65-8eab-540697226d93', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '2098050e-ddcd-4e01-bd34-e66b97e18543', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', 'bd16ddf0-3c3b-409f-a25b-672409b4e51c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', 'cbf81286-834c-4ca6-bda3-cdff2b5be64f', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '2a539284-b7a6-43cc-b70a-c3e5458af01b', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '0b5e5f46-40ee-47d3-948a-50b03d932ba7', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '0e1c4ec6-dc12-4504-822f-b8a4f8e51c63', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', 'f9fb689e-233e-45ab-973e-4425124507f0', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '27c5a1f2-6284-4579-9fd7-8040f79d8e96', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', 'ca97916e-49f5-45a1-8efc-c9f131900871', 5)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '1aee5513-bd67-4af0-afe5-826fc8484d40', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', 'f916a1b9-8c8f-4a4a-a61c-6500980b795f', 8)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', 'a16d4a16-4a21-4899-847b-e298cf8b70ef', 10)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '19706698-6537-42c9-bc5a-b81cc321c975', 12)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '9b7c7011-b49b-464b-bc5b-09c7589d73a4', 14)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '980ed62e-3263-4c30-94f5-2375742ceff1', 14)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', 'dbc0e33e-e772-41bd-8b48-5f62b2a4b6c4', 14)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', 'bed17549-9ca5-434a-a90c-9bd4bfe63117', 20)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '9c58214c-684e-45d6-a2fb-aecd1636572e', 30)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '84c4f0cb-a5df-4581-9866-5f1cfe36584a', 33)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', 'c535144c-9a60-4c68-bc6e-4385d3fb7d4f', 35)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', 'a6e50dca-cc98-45f4-adf8-1f53923b04b6', 50)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('b0d643f7-4ceb-4845-8dcc-c2feddabe819', '055120d5-5cf7-44e6-a82c-9541add63e03', 50)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('3c2c9f02-c34e-48fd-a170-f46d1fbd61f7', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('3c2c9f02-c34e-48fd-a170-f46d1fbd61f7', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('3c2c9f02-c34e-48fd-a170-f46d1fbd61f7', 'bd16ddf0-3c3b-409f-a25b-672409b4e51c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('3c2c9f02-c34e-48fd-a170-f46d1fbd61f7', '7662f360-d224-45de-b7f2-1fde43ce59ac', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('3c2c9f02-c34e-48fd-a170-f46d1fbd61f7', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('3c2c9f02-c34e-48fd-a170-f46d1fbd61f7', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('3c2c9f02-c34e-48fd-a170-f46d1fbd61f7', '0e1c4ec6-dc12-4504-822f-b8a4f8e51c63', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('3c2c9f02-c34e-48fd-a170-f46d1fbd61f7', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('3c2c9f02-c34e-48fd-a170-f46d1fbd61f7', '1aee5513-bd67-4af0-afe5-826fc8484d40', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '2098050e-ddcd-4e01-bd34-e66b97e18543', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '86725718-76c2-4202-bed7-731302540466', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '440aeed0-aaf2-4c65-8eab-540697226d93', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', 'bd16ddf0-3c3b-409f-a25b-672409b4e51c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '44affbcf-612b-4774-8ee8-d477353df397', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', 'cbf81286-834c-4ca6-bda3-cdff2b5be64f', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '2a539284-b7a6-43cc-b70a-c3e5458af01b', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '0b5e5f46-40ee-47d3-948a-50b03d932ba7', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '0e1c4ec6-dc12-4504-822f-b8a4f8e51c63', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '27c5a1f2-6284-4579-9fd7-8040f79d8e96', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', 'f9fb689e-233e-45ab-973e-4425124507f0', 4)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', 'ca97916e-49f5-45a1-8efc-c9f131900871', 5)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '1e025e51-cbd0-4afd-8469-7e5b6b677e56', 6)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', 'f916a1b9-8c8f-4a4a-a61c-6500980b795f', 8)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', 'a16d4a16-4a21-4899-847b-e298cf8b70ef', 10)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '19706698-6537-42c9-bc5a-b81cc321c975', 12)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '9b7c7011-b49b-464b-bc5b-09c7589d73a4', 14)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', 'bed17549-9ca5-434a-a90c-9bd4bfe63117', 20)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '980ed62e-3263-4c30-94f5-2375742ceff1', 28)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', 'dbc0e33e-e772-41bd-8b48-5f62b2a4b6c4', 28)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '9c58214c-684e-45d6-a2fb-aecd1636572e', 30)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '84c4f0cb-a5df-4581-9866-5f1cfe36584a', 33)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', 'c535144c-9a60-4c68-bc6e-4385d3fb7d4f', 35)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', 'a6e50dca-cc98-45f4-adf8-1f53923b04b6', 50)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('02f17623-5457-498d-8b65-b3c067f4e7d1', '055120d5-5cf7-44e6-a82c-9541add63e03', 50)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('5a268d99-4b9f-45de-a8b0-5f0d6272c1fc', '44affbcf-612b-4774-8ee8-d477353df397', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('5a268d99-4b9f-45de-a8b0-5f0d6272c1fc', '082b73f6-779e-478f-b48e-379a1f4ee455', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('5a268d99-4b9f-45de-a8b0-5f0d6272c1fc', 'bd16ddf0-3c3b-409f-a25b-672409b4e51c', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('5a268d99-4b9f-45de-a8b0-5f0d6272c1fc', 'f9845e1a-d90b-46b8-af53-db78b1ef01a5', 1)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('5a268d99-4b9f-45de-a8b0-5f0d6272c1fc', '44cb181e-93b2-49ff-9697-d0379ff72945', 2)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('5a268d99-4b9f-45de-a8b0-5f0d6272c1fc', '0e1c4ec6-dc12-4504-822f-b8a4f8e51c63', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('5a268d99-4b9f-45de-a8b0-5f0d6272c1fc', '8fef13ca-5f66-4313-ab96-86a20810020e', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('5a268d99-4b9f-45de-a8b0-5f0d6272c1fc', '96a91940-0452-4df0-9743-477d2988f9d1', 3)
  ON CONFLICT DO NOTHING;
INSERT INTO product_bundle_items (bundle_product_id, component_product_id, quantity)
  VALUES ('5a268d99-4b9f-45de-a8b0-5f0d6272c1fc', '1e025e51-cbd0-4afd-8469-7e5b6b677e56', 6)
  ON CONFLICT DO NOTHING;

-- STEP 4: Audit log entry
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes, created_at)
  VALUES (
    'fed67e39-4a36-4d76-8b90-0b63190cedd6',
    'd23921b0-7ecf-4cf9-8c90-13f46e927d22',
    'production_kit_migration',
    'products',
    'batch',
    '{"description":"Migrated 3 missing components + 14 kit/bundle products + 271 bundle links from dev to production","operator_authorized":true,"skus_inserted":["ITFI-LM-550WP","SLX-INV-3KW-1P","TATA-525WP-BI-P","ITFI-ADANI-4KW-FULLKIT","ITFI-ADANI-4KW-HALFKIT","ITFI-ADANI-5KW-FULLKIT","ITFI-ADANI-5KW-HALFKIT","ITFI-EST-3KW-FULL-KIT","ITFI-EST-3KW-HALF-KIT","ITFI-LM-3KW-FULL-KIT","ITFI-LM-3KW-HALF-KIT","ITFI-TATA-3KW-FULL-KIT","ITFI-TATA-3KW-HALF-KIT","ITFI-WAR-3KW-FULL-KIT","ITFI-WAR-3KW-HALF-KIT","ITFI-WEBSL-3KW-FULL-KIT","ITFI-WEBSL-3KW-HALF-KIT"]}'::jsonb,
    NOW()
  );

COMMIT;

-- Verify
SELECT COUNT(*) AS kits_inserted FROM products WHERE type='bundle' AND sku LIKE 'ITFI-%';
SELECT COUNT(*) AS links_inserted FROM product_bundle_items pbi JOIN products p ON p.id=pbi.bundle_product_id WHERE p.sku LIKE 'ITFI-%KIT%';`;

  export interface KitMigrationResult {
    alreadyDone: boolean;
    kitsInserted?: number;
    linksInserted?: number;
    message: string;
  }

  export async function runKitMigration(): Promise<KitMigrationResult> {
    const client = await pool.connect();
    try {
      const existing = await client.query(
        `SELECT COUNT(*) AS cnt FROM products WHERE type = 'bundle' AND sku LIKE 'ITFI-%'`
      );
      const existingCount = parseInt(existing.rows[0].cnt, 10);
      if (existingCount >= 14) {
        return {
          alreadyDone: true,
          kitsInserted: existingCount,
          message: `Migration already done — ${existingCount} kit products already exist in production.`,
        };
      }

      await client.query(MIGRATION_SQL);

      const afterKits = await client.query(
        `SELECT COUNT(*) AS cnt FROM products WHERE type = 'bundle' AND sku LIKE 'ITFI-%'`
      );
      const afterLinks = await client.query(
        `SELECT COUNT(*) AS cnt FROM product_bundle_items pbi
         JOIN products p ON p.id = pbi.bundle_product_id
         WHERE p.sku LIKE 'ITFI-%KIT%'`
      );

      const kitsInserted = parseInt(afterKits.rows[0].cnt, 10);
      const linksInserted = parseInt(afterLinks.rows[0].cnt, 10);

      return {
        alreadyDone: false,
        kitsInserted,
        linksInserted,
        message: `Migration complete. ${kitsInserted} kit products + ${linksInserted} bundle component links inserted.`,
      };
    } finally {
      client.release();
    }
  }
  