/**
 * Category-specific spec templates for the Products dynamic Specs editor (Phase 4).
 *
 * Twelve "spec-stable" categories have a typed template of expected fields.
 * The remaining four (GTI Accessory, Inverter Accessory, Solar BOS Kit,
 * Solar Combo / SPGS) intentionally have no entry — those use only
 * user-defined custom fields ("Add Custom Field" rows).
 *
 * Field types:
 *   - "number"  -> numeric input (suffix optional, e.g. "W", "Ah")
 *   - "text"    -> free-text input
 *   - "select"  -> dropdown with provided options
 *
 * The spec object is persisted as JSONB in `products.specs` and validated
 * server-side via `productSpecsSchema` in `shared/schema.ts`.
 */

import type { ProductCategory } from "@shared/schema";

export type SpecFieldType = "number" | "text" | "select";

export interface SpecFieldTemplate {
  /** Stable storage key, also used as the JSON key in `products.specs`. */
  key: string;
  /** Human-readable label rendered next to the input. */
  label: string;
  /** Input type. */
  type: SpecFieldType;
  /** Optional suffix shown after a number input (e.g. "W", "Ah", "V"). */
  suffix?: string;
  /** Options for "select" fields. */
  options?: string[];
  /** Optional placeholder text. */
  placeholder?: string;
}

export const categorySpecTemplates: Partial<Record<ProductCategory, SpecFieldTemplate[]>> = {
  "Solar PCU - Sine Wave": [
    { key: "capacity_va",      label: "Capacity",          type: "number", suffix: "VA" },
    { key: "battery_voltage",  label: "Battery Voltage",   type: "number", suffix: "V" },
    { key: "waveform",         label: "Waveform",          type: "select", options: ["Pure Sine Wave", "Modified Sine Wave"] },
    { key: "topology",         label: "Topology",          type: "select", options: ["Off-Grid", "Hybrid"] },
  ],
  "Solar PCU - MPPT": [
    { key: "capacity_va",      label: "Capacity",          type: "number", suffix: "VA" },
    { key: "battery_voltage",  label: "Battery Voltage",   type: "number", suffix: "V" },
    { key: "mppt_voltage_range", label: "MPPT Voltage Range", type: "text", placeholder: "e.g. 60-150V" },
    { key: "max_pv_input_w",   label: "Max PV Input",      type: "number", suffix: "W" },
  ],
  "Grid Tie Inverter - 1 Phase": [
    { key: "output_power_kw",  label: "Output Power",      type: "number", suffix: "kW" },
    { key: "mppt_channels",    label: "MPPT Channels",     type: "number" },
    { key: "max_pv_input_v",   label: "Max PV Input",      type: "number", suffix: "V" },
    { key: "efficiency_pct",   label: "Efficiency",        type: "number", suffix: "%" },
  ],
  "Grid Tie Inverter - 3 Phase": [
    { key: "output_power_kw",  label: "Output Power",      type: "number", suffix: "kW" },
    { key: "mppt_channels",    label: "MPPT Channels",     type: "number" },
    { key: "max_pv_input_v",   label: "Max PV Input",      type: "number", suffix: "V" },
    { key: "efficiency_pct",   label: "Efficiency",        type: "number", suffix: "%" },
  ],
  "Hybrid Inverter": [
    { key: "output_power_kw",  label: "Output Power",      type: "number", suffix: "kW" },
    { key: "battery_voltage",  label: "Battery Voltage",   type: "number", suffix: "V" },
    { key: "mppt_channels",    label: "MPPT Channels",     type: "number" },
    { key: "backup_capable",   label: "Backup Capable",    type: "select", options: ["Yes", "No"] },
  ],
  "Home UPS / Inverter": [
    { key: "capacity_va",      label: "Capacity",          type: "number", suffix: "VA" },
    { key: "battery_voltage",  label: "Battery Voltage",   type: "number", suffix: "V" },
    { key: "waveform",         label: "Waveform",          type: "select", options: ["Pure Sine Wave", "Modified Sine Wave", "Square Wave"] },
  ],
  "Solar Battery - Lead Acid": [
    { key: "capacity_ah",      label: "Capacity",          type: "number", suffix: "Ah" },
    { key: "voltage_v",        label: "Voltage",           type: "number", suffix: "V" },
    { key: "c_rating",         label: "C-Rating",          type: "text",   placeholder: "e.g. C10" },
    { key: "warranty_cycles",  label: "Warranty Cycles",   type: "number" },
  ],
  "Solar Battery - Lithium": [
    { key: "capacity_ah",      label: "Capacity",          type: "number", suffix: "Ah" },
    { key: "voltage_v",        label: "Voltage",           type: "number", suffix: "V" },
    { key: "cycles",           label: "Cycles",            type: "number" },
    { key: "chemistry",        label: "Chemistry",         type: "select", options: ["LiFePO4", "NMC", "LTO"] },
    { key: "dod_pct",          label: "Depth of Discharge", type: "number", suffix: "%" },
  ],
  "Home Battery - Lead Acid": [
    { key: "capacity_ah",      label: "Capacity",          type: "number", suffix: "Ah" },
    { key: "voltage_v",        label: "Voltage",           type: "number", suffix: "V" },
    { key: "battery_type",     label: "Battery Type",      type: "select", options: ["Tubular", "Flat Plate", "Gel"] },
  ],
  "Rack / Wall Battery": [
    { key: "capacity_kwh",     label: "Capacity",          type: "number", suffix: "kWh" },
    { key: "voltage_v",        label: "Voltage",           type: "number", suffix: "V" },
    { key: "chemistry",        label: "Chemistry",         type: "select", options: ["LiFePO4", "NMC"] },
    { key: "cycles",           label: "Cycles",            type: "number" },
  ],
  "Solar Panel / PV Module": [
    { key: "wattage_w",        label: "Wattage",           type: "number", suffix: "W" },
    { key: "vmp_v",            label: "Vmp (Voltage at Max Power)", type: "number", suffix: "V" },
    { key: "imp_a",            label: "Imp (Current at Max Power)", type: "number", suffix: "A" },
    { key: "cells",            label: "No. of Cells",      type: "number" },
    { key: "cell_type",        label: "Cell Type",         type: "select", options: ["Monocrystalline", "Polycrystalline", "Bifacial", "Mono PERC", "TOPCon"] },
    { key: "efficiency_pct",   label: "Efficiency",        type: "number", suffix: "%" },
    { key: "dimensions_mm",    label: "Dimensions",        type: "text",   placeholder: "L × W × H mm" },
  ],
  "Solar Charge Controller": [
    { key: "controller_type",  label: "Type",              type: "select", options: ["PWM", "MPPT"] },
    { key: "current_rating_a", label: "Current Rating",    type: "number", suffix: "A" },
    { key: "system_voltage_v", label: "System Voltage",    type: "number", suffix: "V" },
    { key: "max_pv_input_v",   label: "Max PV Input",      type: "number", suffix: "V" },
  ],
};

/** Returns the template for a given category, or [] for kit/accessory categories. */
export function getCategoryTemplate(category: string): SpecFieldTemplate[] {
  return categorySpecTemplates[category as ProductCategory] ?? [];
}

/** True if a category has a spec template (i.e. is one of the 12 spec-stable categories). */
export function hasSpecTemplate(category: string): boolean {
  return category in categorySpecTemplates;
}

/** Set of template keys for a category — used to distinguish template fields from custom fields. */
export function templateKeysFor(category: string): Set<string> {
  return new Set(getCategoryTemplate(category).map((f) => f.key));
}
