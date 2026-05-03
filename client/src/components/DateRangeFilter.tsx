/**
 * Phase 4C — Shared date range picker for financial dashboard + reports.
 * 10 presets + custom range. URL-persisted via ?from=YYYY-MM-DD&to=YYYY-MM-DD.
 *
 * Usage:
 *   const { from, to, presetKey, setRange } = useDateRange("this_month");
 *   <DateRangeFilter value={{ from, to, presetKey }} onChange={setRange} />
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate, toIsoDate } from "@/lib/format";

export type DateRangePresetKey =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_fy"
  | "last_fy"
  | "all_time"
  | "custom";

export interface DateRangeValue {
  from: Date | null;
  to: Date | null;
  presetKey: DateRangePresetKey;
}

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

export function computePresetRange(key: DateRangePresetKey, ref = new Date()): { from: Date | null; to: Date | null } {
  const now = startOfDay(ref);
  const today = new Date(now);
  switch (key) {
    case "today":
      return { from: today, to: endOfDay(today) };
    case "yesterday": {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { from: y, to: endOfDay(y) };
    }
    case "last_7": {
      const d = new Date(today); d.setDate(d.getDate() - 6); // includes today => 7-day window
      return { from: d, to: endOfDay(today) };
    }
    case "last_30": {
      const d = new Date(today); d.setDate(d.getDate() - 29); // includes today => 30-day window
      return { from: d, to: endOfDay(today) };
    }
    case "this_month": {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: d, to: endOfDay(today) };
    }
    case "last_month": {
      const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: d, to: endOfDay(e) };
    }
    case "this_quarter": {
      const q = Math.floor(today.getMonth() / 3);
      const d = new Date(today.getFullYear(), q * 3, 1);
      return { from: d, to: endOfDay(today) };
    }
    case "this_fy": {
      // Indian FY: Apr 1 → Mar 31. month index Apr = 3.
      const fyStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
      const d = new Date(fyStart, 3, 1);
      return { from: d, to: endOfDay(today) };
    }
    case "last_fy": {
      const fyStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
      const d = new Date(fyStart - 1, 3, 1);
      const e = new Date(fyStart, 2, 31); // Mar 31 of fyStart
      return { from: d, to: endOfDay(e) };
    }
    case "all_time":
      return { from: null, to: null };
    case "custom":
      return { from: null, to: null };
    default:
      return { from: null, to: null };
  }
}

const PRESET_LABELS: Record<DateRangePresetKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7: "Last 7 Days",
  last_30: "Last 30 Days",
  this_month: "This Month",
  last_month: "Last Month",
  this_quarter: "This Quarter",
  this_fy: "This FY (Apr–Mar)",
  last_fy: "Last FY (Apr–Mar)",
  all_time: "All Time",
  custom: "Custom Range",
};

const PRESET_ORDER: DateRangePresetKey[] = [
  "today", "yesterday", "last_7", "last_30",
  "this_month", "last_month", "this_quarter",
  "this_fy", "last_fy", "all_time", "custom",
];

/**
 * URL-persisted date-range hook. Reads ?from=&to=&preset= from current URL,
 * writes back when user changes range. If URL has no params, uses `defaultPreset`.
 */
export function useDateRange(defaultPreset: DateRangePresetKey = "this_month"): DateRangeValue & {
  setRange: (v: DateRangeValue) => void;
  fromIso: string | undefined;
  toIso: string | undefined;
} {
  const [location, navigate] = useLocation();
  const sp = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, [location, typeof window !== "undefined" ? window.location.search : ""]);

  const initial = useMemo<DateRangeValue>(() => {
    const presetParam = sp.get("preset") as DateRangePresetKey | null;
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    if (fromParam && toParam) {
      return {
        from: new Date(fromParam + "T00:00:00"),
        to:   new Date(toParam + "T23:59:59"),
        presetKey: presetParam || "custom",
      };
    }
    if (presetParam && PRESET_ORDER.includes(presetParam)) {
      const r = computePresetRange(presetParam);
      return { ...r, presetKey: presetParam };
    }
    const r = computePresetRange(defaultPreset);
    return { ...r, presetKey: defaultPreset };
  }, []);

  const [value, setValue] = useState<DateRangeValue>(initial);

  const setRange = useCallback((v: DateRangeValue) => {
    setValue(v);
    if (typeof window === "undefined") return;
    const next = new URLSearchParams(window.location.search);
    next.set("preset", v.presetKey);
    if (v.from) next.set("from", toIsoDate(v.from)); else next.delete("from");
    if (v.to)   next.set("to",   toIsoDate(v.to));   else next.delete("to");
    const newUrl = `${window.location.pathname}?${next.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }, []);

  return {
    ...value,
    setRange,
    fromIso: value.from ? toIsoDate(value.from) : undefined,
    toIso:   value.to   ? toIsoDate(value.to)   : undefined,
  };
}

interface Props {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  className?: string;
  align?: "start" | "end" | "center";
}

export default function DateRangeFilter({ value, onChange, className, align = "start" }: Props) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<Date | undefined>(value.from ?? undefined);
  const [draftTo, setDraftTo] = useState<Date | undefined>(value.to ?? undefined);

  useEffect(() => {
    setDraftFrom(value.from ?? undefined);
    setDraftTo(value.to ?? undefined);
  }, [value.from, value.to]);

  const onPresetChange = (key: string) => {
    const k = key as DateRangePresetKey;
    if (k === "custom") {
      onChange({ ...value, presetKey: "custom" });
      setOpen(true);
      return;
    }
    const r = computePresetRange(k);
    onChange({ from: r.from, to: r.to, presetKey: k });
  };

  const applyCustom = () => {
    if (draftFrom && draftTo) {
      onChange({ from: draftFrom, to: endOfDay(draftTo), presetKey: "custom" });
      setOpen(false);
    }
  };

  const label = value.presetKey === "all_time"
    ? "All Time"
    : value.from && value.to
      ? `${fmtDate(value.from)} → ${fmtDate(value.to)}`
      : PRESET_LABELS[value.presetKey];

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`} data-testid="date-range-filter">
      <Select value={value.presetKey} onValueChange={onPresetChange}>
        <SelectTrigger className="w-[160px]" data-testid="select-date-preset">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESET_ORDER.map(k => (
            <SelectItem key={k} value={k} data-testid={`option-preset-${k}`}>
              {PRESET_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="font-normal"
            data-testid="button-date-range-display"
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {label}
            <ChevronDown className="ml-2 h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-auto p-3">
          <div className="text-xs font-medium mb-2 text-muted-foreground">Custom range</div>
          <div className="flex gap-3">
            <div>
              <div className="text-xs mb-1">From</div>
              <Calendar
                mode="single"
                selected={draftFrom}
                onSelect={setDraftFrom}
                data-testid="calendar-from"
              />
            </div>
            <div>
              <div className="text-xs mb-1">To</div>
              <Calendar
                mode="single"
                selected={draftTo}
                onSelect={setDraftTo}
                disabled={(d) => (draftFrom ? d < draftFrom : false)}
                data-testid="calendar-to"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} data-testid="button-cancel-date-range">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={applyCustom}
              disabled={!draftFrom || !draftTo}
              data-testid="button-apply-date-range"
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
