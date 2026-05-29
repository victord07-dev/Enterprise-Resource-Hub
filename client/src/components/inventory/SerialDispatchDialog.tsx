/**
 * Phase 4E (v2) — Atomic Serial Dispatch Dialog for Delivery Challan dispatch.
 *
 * Supports both regular serialised products AND bundle products with serialised
 * components. All serial selections are held client-side until the user confirms;
 * a single atomic backend request validates and commits everything in one transaction.
 *
 * Multi-spec navigation: when there are multiple components requiring serial
 * assignment (e.g. a bundle with 2 tracked components), a sidebar shows all
 * specs so the user can switch between them. Auto-advances to the next incomplete
 * spec after the current one is filled via scan.
 *
 * Primary selection method: USB/Bluetooth scanner (auto-detected by keystroke speed).
 * Secondary: keyboard type + Enter, or click checkbox.
 *
 * Hard rules:
 *  - Only in_stock serials belonging to the challan source warehouse are shown.
 *  - Selected count must equal requiredQty exactly per spec.
 *  - All specs must be complete before Confirm is enabled.
 *  - Warranty months required before submit (0 = no warranty).
 *  - Cannot exceed required qty — hard-blocked in UI.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, CheckCircle2, Package, ScanLine, X, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/** One serial-tracking assignment slot for the dialog. */
export interface SerialAssignmentSpec {
  /** Challan item ID that owns this assignment. */
  challanItemId: string;
  /** Product ID to fetch available serials for (the component or the direct product). */
  componentProductId: string;
  /** Label shown in the UI: component product name (or product name for non-bundles). */
  displayName: string;
  /** If this spec is a bundle component, the human-readable parent bundle name. */
  parentBundleName?: string;
  /** How many serial numbers must be assigned for this spec. */
  requiredQty: number;
  /** Warehouse to filter available serials. Null when source is not a warehouse. */
  warehouseId: string | null;
}

/** The serialIds selected for one spec, returned on confirm. */
export interface ConfirmedAssignment {
  challanItemId: string;
  componentProductId: string;
  serialIds: string[];
}

interface Props {
  open: boolean;
  challanId: string;
  salesOrderId: string | null;
  customerId: string;
  /** One entry per (challanItem × trackedComponent) pair requiring serial assignment. */
  specs: SerialAssignmentSpec[];
  onClose: () => void;
  /**
   * Called when the user confirms all selections.
   * The parent is responsible for submitting the single atomic dispatch request.
   */
  onConfirm: (assignments: ConfirmedAssignment[], warrantyMonths: number) => void;
}

type ScanFeedback = { type: "success"; message: string } | { type: "error"; message: string } | null;

function normSerial(s: string) { return s.trim().toUpperCase(); }

/** Stable, unique key for a spec within this dialog session. */
function specKey(spec: SerialAssignmentSpec) {
  return `${spec.challanItemId}::${spec.componentProductId}`;
}

// ── Web Audio API feedback ────────────────────────────────────────────────────
function useAudioFeedback() {
  const ctxRef = useRef<AudioContext | null>(null);

  function getCtx(): AudioContext | null {
    try {
      if (!ctxRef.current) {
        ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      return ctxRef.current;
    } catch { return null; }
  }

  function playTone(frequency: number, duration: number, type: OscillatorType, gain: number) {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = frequency;
      gainNode.gain.setValueAtTime(gain, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }

  return {
    beepSuccess: () => playTone(880, 0.12, "sine",   0.25),
    beepError:   () => playTone(220, 0.28, "square", 0.20),
  };
}

export default function SerialDispatchDialog({
  open, challanId, salesOrderId, customerId, specs, onClose, onConfirm,
}: Props) {
  const { toast } = useToast();
  const { beepSuccess, beepError } = useAudioFeedback();

  // Per-spec serial selections. Key = specKey(spec), value = Set of serial IDs.
  const [selectedByKey, setSelectedByKey] = useState<Record<string, Set<string>>>({});
  const [activeIdx, setActiveIdx]         = useState(0);
  const [warrantyMonths, setWarrantyMonths] = useState("");
  const [confirming, setConfirming]       = useState(false);

  // Scan-to-select state
  const [scanInput, setScanInput]         = useState("");
  const [scanFeedback, setScanFeedback]   = useState<ScanFeedback>(null);
  const scanRef                           = useRef<HTMLInputElement | null>(null);
  const feedbackTimer                     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs                           = useRef<Record<string, HTMLDivElement | null>>({});
  const scanTimerRef                      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanStartRef                      = useRef<number>(0);

  // Reset all state whenever the dialog opens or the spec set changes.
  const stateResetKey = `${open}::${specs.map(specKey).join("|")}`;
  const [prevResetKey, setPrevResetKey]   = useState("");
  if (stateResetKey !== prevResetKey) {
    setPrevResetKey(stateResetKey);
    setSelectedByKey({});
    setActiveIdx(0);
    setWarrantyMonths("");
    setScanInput("");
    setScanFeedback(null);
  }

  const warrantyRef = useRef<HTMLInputElement | null>(null);

  // Keep scan input focused whenever the active spec changes.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => scanRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open, activeIdx]);

  const activeSpec = specs[activeIdx] ?? null;

  // Available serials for the currently active spec.
  const { data: available = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/serial-numbers/available", activeSpec?.componentProductId, activeSpec?.warehouseId],
    queryFn: () => {
      const params = new URLSearchParams({ productId: activeSpec!.componentProductId });
      if (activeSpec!.warehouseId) params.set("warehouseId", activeSpec!.warehouseId);
      return apiRequest("GET", `/api/serial-numbers/available?${params}`).then(r => r.json());
    },
    enabled: open && !!activeSpec,
  });

  const getSelected = useCallback((spec: SerialAssignmentSpec): Set<string> => {
    return selectedByKey[specKey(spec)] ?? new Set<string>();
  }, [selectedByKey]);

  const isSpecComplete = useCallback((spec: SerialAssignmentSpec): boolean => {
    return getSelected(spec).size === spec.requiredQty;
  }, [getSelected]);

  const allComplete   = specs.length > 0 && specs.every(isSpecComplete);
  const canConfirm    = allComplete && warrantyMonths !== "" && !confirming;

  const activeSelected  = activeSpec ? getSelected(activeSpec) : new Set<string>();
  const required        = activeSpec?.requiredQty ?? 0;
  const selectedCount   = activeSelected.size;
  const remaining       = required - selectedCount;

  // Auto-advance focus to warranty field once all specs are fully scanned.
  // Placed here so selectedCount / required / isSpecComplete are already in scope.
  useEffect(() => {
    if (!open || required === 0) return;
    if (selectedCount === required && specs.every(isSpecComplete)) {
      setTimeout(() => warrantyRef.current?.focus(), 350);
    }
  }, [selectedCount, required, open]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function showFeedback(fb: ScanFeedback) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setScanFeedback(fb);
    feedbackTimer.current = setTimeout(() => setScanFeedback(null), 2500);
  }

  function setActiveSelected(next: Set<string>) {
    if (!activeSpec) return;
    setSelectedByKey(prev => ({ ...prev, [specKey(activeSpec)]: next }));
  }

  // ── Scan logic ────────────────────────────────────────────────────────────────
  function processScan(raw: string) {
    const val = normSerial(raw);
    setScanInput("");
    setTimeout(() => scanRef.current?.focus(), 0);
    if (!val) return;

    if (selectedCount >= required) {
      beepError();
      showFeedback({ type: "error", message: `Already selected ${required}/${required} — cannot add more.` });
      return;
    }

    const match = available.find(
      s => normSerial(s.serialNumber) === val || (s.barcodeValue && normSerial(s.barcodeValue) === val),
    );
    if (!match) {
      beepError();
      showFeedback({ type: "error", message: `'${val}' not found in available stock for this warehouse.` });
      return;
    }
    if (activeSelected.has(match.id)) {
      beepError();
      showFeedback({ type: "error", message: `'${match.serialNumber}' is already selected.` });
      return;
    }

    beepSuccess();
    const next = new Set(activeSelected);
    next.add(match.id);
    setActiveSelected(next);
    showFeedback({ type: "success", message: `✓ ${match.serialNumber} selected (${next.size}/${required})` });
    setTimeout(() => rowRefs.current[match.id]?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);

    // Auto-advance to the next incomplete spec after this one is filled.
    if (next.size === required && specs.length > 1) {
      const updatedMap = { ...selectedByKey, [specKey(activeSpec!)]: next };
      const nextIdx = specs.findIndex((s, i) => {
        if (i === activeIdx) return false;
        return (updatedMap[specKey(s)]?.size ?? 0) < s.requiredQty;
      });
      if (nextIdx !== -1) {
        setTimeout(() => {
          setActiveIdx(nextIdx);
          setScanInput("");
          setScanFeedback(null);
        }, 600);
      }
    }
  }

  function handleScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); processScan(scanInput); }
  }

  // Machine-speed auto-submit (USB/BT scanners that don't send an Enter terminator).
  // 30 ms/char threshold — accommodates slower packet-splitting Bluetooth scanners.
  function handleScanChange(value: string) {
    if (!value) { setScanInput(""); return; }
    if (scanInput === "" && value.length === 1) scanStartRef.current = Date.now();
    setScanInput(value);
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = setTimeout(() => {
      const elapsed = Date.now() - scanStartRef.current;
      if (value.length > 0 && elapsed / value.length < 30) processScan(value);
    }, 200);
  }

  function toggleSerial(id: string) {
    const next = new Set(activeSelected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= required) {
        toast({
          title: "Limit reached",
          description: `Only ${required} unit(s) can be dispatched for this component.`,
          variant: "destructive",
        });
        return;
      }
      next.add(id);
    }
    setActiveSelected(next);
  }

  // ── Confirm ────────────────────────────────────────────────────────────────────
  function handleConfirm() {
    if (!canConfirm) return;
    setConfirming(true);
    try {
      const assignments: ConfirmedAssignment[] = specs.map(spec => ({
        challanItemId:       spec.challanItemId,
        componentProductId:  spec.componentProductId,
        serialIds:           Array.from(getSelected(spec)),
      }));
      onConfirm(assignments, Number(warrantyMonths));
    } finally {
      setConfirming(false);
    }
  }

  const hasMultiple     = specs.length > 1;
  const completedCount  = specs.filter(isSpecComplete).length;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            Select Units to Dispatch
          </DialogTitle>
        </DialogHeader>

        <div className={hasMultiple ? "grid grid-cols-[190px_1fr] gap-4" : "space-y-4"}>

          {/* ── Component sidebar (only when multiple specs) ── */}
          {hasMultiple && (
            <div className="space-y-1 border-r pr-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Components
              </p>
              {specs.map((spec, idx) => {
                const complete  = isSpecComplete(spec);
                const cnt       = getSelected(spec).size;
                const isActive  = idx === activeIdx;
                return (
                  <button
                    key={specKey(spec)}
                    type="button"
                    onClick={() => { setActiveIdx(idx); setScanInput(""); setScanFeedback(null); }}
                    className={`w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors flex items-center gap-2
                      ${isActive
                        ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-700 font-medium"
                        : "hover:bg-muted/50 border border-transparent"
                      }`}
                  >
                    <span className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold
                      ${complete
                        ? "bg-green-500 text-white"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                      }`}>
                      {complete ? "✓" : idx + 1}
                    </span>
                    <span className="flex-1 min-w-0 truncate leading-tight">{spec.displayName}</span>
                    <span className={`shrink-0 font-mono text-[10px] tabular-nums
                      ${complete ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                      {cnt}/{spec.requiredQty}
                    </span>
                    {isActive && <ChevronRight className="w-3 h-3 shrink-0 text-blue-500" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Active spec panel ── */}
          <div className="space-y-3">

            {/* Spec header */}
            <div>
              {!hasMultiple && (
                <p className="text-sm text-muted-foreground mb-1">
                  Select the {required} unit{required !== 1 ? "s" : ""} being dispatched.
                  Only in-stock units at the source warehouse are shown.
                </p>
              )}
              <p className="font-semibold text-sm">{activeSpec?.displayName}</p>
              {activeSpec?.parentBundleName && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Component of: <span className="font-medium">{activeSpec.parentBundleName}</span>
                </p>
              )}
            </div>

            {/* Count banner */}
            <div className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium
              ${selectedCount === required
                ? "border-green-200 bg-green-50 text-green-700 dark:bg-green-950/20 dark:border-green-800 dark:text-green-300"
                : "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300"
              }`}>
              {selectedCount === required
                ? <CheckCircle2 className="w-4 h-4" />
                : <AlertTriangle className="w-4 h-4" />}
              <span>{required} required</span>
              <span className="text-muted-foreground">·</span>
              <span>{selectedCount} selected</span>
              <span className="text-muted-foreground">·</span>
              <span className={remaining > 0 ? "font-bold" : ""}>{remaining} remaining</span>
            </div>

            {/* ── Primary action: Scan input ─────────────────────────────── */}
            <div className="space-y-2">
              {selectedCount < required ? (
                <div className={`relative rounded-lg border-2 transition-colors ${
                  scanFeedback?.type === "error"
                    ? "border-red-400 bg-red-50/50 dark:bg-red-950/10"
                    : scanFeedback?.type === "success"
                      ? "border-green-400 bg-green-50/50 dark:bg-green-950/10"
                      : "border-blue-300 bg-blue-50/40 dark:bg-blue-950/10 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800"
                }`}>
                  <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                    <ScanLine className={`w-5 h-5 shrink-0 ${
                      scanFeedback?.type === "error" ? "text-red-500"
                      : scanFeedback?.type === "success" ? "text-green-600"
                      : "text-blue-500"
                    }`} />
                    <span className="text-xs font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400">
                      Scan Barcode / Serial Number
                    </span>
                  </div>
                  <div className="relative px-3 pb-2.5">
                    <Input
                      ref={scanRef}
                      value={scanInput}
                      onChange={e => handleScanChange(e.target.value)}
                      onKeyDown={handleScanKeyDown}
                      placeholder="Point scanner at barcode and scan, or type here…"
                      className="font-mono text-base h-11 pr-8 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 placeholder:text-muted-foreground/60"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      autoFocus
                    />
                    {scanInput && (
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => { setScanInput(""); scanRef.current?.focus(); }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {/* Feedback inside the scan box */}
                  {scanFeedback && (
                    <div className={`px-3 pb-2 flex items-center gap-1.5 text-sm font-medium ${
                      scanFeedback.type === "error" ? "text-red-600" : "text-green-600"
                    }`}>
                      {scanFeedback.type === "error"
                        ? <AlertTriangle className="w-4 h-4 shrink-0" />
                        : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                      {scanFeedback.message}
                    </div>
                  )}
                  {!scanFeedback && (
                    <p className="px-3 pb-2 text-[11px] text-muted-foreground/70">
                      USB / Bluetooth scanners supported — press Enter after typing
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border-2 border-green-400 bg-green-50/60 dark:bg-green-950/20 px-4 py-3 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                      All {required} unit{required !== 1 ? "s" : ""} scanned
                    </p>
                    <p className="text-xs text-green-600/80 dark:text-green-500/80">
                      Deselect from the list below to change selection.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Secondary: Serial list (confirmation / manual fallback) ─── */}
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : available.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                No serial numbers are in stock at this warehouse for this product.
                Receive stock via a GRN before dispatching.
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                  {selectedCount > 0 ? `${selectedCount} selected · ` : ""}Available inventory — or select manually
                </p>
                <div className="space-y-1 max-h-44 overflow-y-auto border rounded-md p-2">
                  {available.map((serial: any) => {
                    const isSelected = activeSelected.has(serial.id);
                    const isDisabled = !isSelected && selectedCount >= required;
                    return (
                      <div
                        key={serial.id}
                        ref={el => { rowRefs.current[serial.id] = el; }}
                        className={`flex items-center gap-3 rounded px-2 py-1.5 transition-colors
                          ${isSelected
                            ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
                            : isDisabled
                              ? "opacity-40 cursor-not-allowed"
                              : "hover:bg-muted/50 cursor-pointer"
                          }`}
                        onClick={() => !isDisabled && toggleSerial(serial.id)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => !isDisabled && toggleSerial(serial.id)}
                          disabled={isDisabled}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-sm font-medium">{serial.serialNumber}</span>
                          {serial.barcodeValue && (
                            <span className="ml-2 text-[11px] font-mono text-muted-foreground">
                              · {serial.barcodeValue}
                            </span>
                          )}
                        </div>
                        {isSelected
                          ? <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                          : <Badge variant="outline" className="text-xs shrink-0">in_stock</Badge>
                        }
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Overall progress bar when multiple specs */}
        {hasMultiple && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
            <span className="font-medium">
              {completedCount}/{specs.length} components assigned
            </span>
            {allComplete && (
              <span className="text-green-600 dark:text-green-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> All components ready
              </span>
            )}
          </div>
        )}

        {/* Warranty months — single value for the whole challan */}
        <div className="space-y-1.5">
          <Label>
            Warranty Duration (months) <span className="text-red-500">*</span>
          </Label>
          <Input
            ref={warrantyRef}
            type="number"
            min="0"
            value={warrantyMonths}
            onChange={e => setWarrantyMonths(e.target.value)}
            placeholder="e.g. 24 — enter 0 if no warranty"
            data-testid="input-warranty-months"
          />
          <p className="text-xs text-muted-foreground">
            Applied to all dispatched units. Expiry is calculated automatically from today.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={confirming}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            data-testid="button-confirm-dispatch-serials"
          >
            {confirming
              ? "Dispatching…"
              : hasMultiple
                ? `Confirm Dispatch (${completedCount}/${specs.length} ready)`
                : `Confirm Dispatch (${selectedCount}/${required})`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
