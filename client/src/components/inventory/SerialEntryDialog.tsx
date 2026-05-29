/**
 * Phase 4E — Serial Entry Dialog for GRN confirmation.
 *
 * PRIMARY input method: USB / Bluetooth barcode scanner (keyboard-emulation).
 *   • Scanner types characters at machine speed then sends Enter/Tab.
 *   • Dialog auto-focuses first empty field on open.
 *   • Enter key advances to next serial field.
 *   • Machine-speed detection (all chars < 50 ms apart) triggers auto-advance
 *     after a 150 ms debounce — handles scanners that don't send Enter.
 *
 * SECONDARY: manual keyboard typing.
 * TERTIARY:  bulk multiline paste.
 * OPTIONAL:  mobile camera scanning (Quagga2) behind an experimental toggle.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, CheckCircle2, ScanLine, ClipboardPaste,
  Camera, CameraOff, Loader2, ChevronDown, ChevronUp, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export interface SerialEntryItem {
  grnItemId:   string;
  productId:   string;
  productName: string;
  receivedQty: number;
  warehouseId: string;
}

interface Props {
  open:    boolean;
  grnId:   string;
  item:    SerialEntryItem | null;
  onClose: () => void;
  onSaved: (grnItemId: string) => void;
}

function norm(s: unknown): string { return (s == null ? "" : String(s)).trim().toUpperCase(); }

export default function SerialEntryDialog({ open, grnId, item, onClose, onSaved }: Props) {
  const { toast } = useToast();

  // ── Core state ────────────────────────────────────────────────────────────
  const [serials, setSerials]     = useState<string[]>([]);
  const [barcodes, setBarcodes]   = useState<string[]>([]); // parallel array, camera fills this
  const [errors, setErrors]       = useState<Record<number, string>>({});
  const [saving, setSaving]       = useState(false);

  // ── Camera (optional / experimental) ─────────────────────────────────────
  const [cameraOpen, setCameraOpen]     = useState(false); // section expanded?
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady]   = useState(false);
  const [cameraError, setCameraError]   = useState<string | null>(null);
  const [lastScanned, setLastScanned]   = useState<string | null>(null);
  const [paused, setPaused]             = useState(false);

  // ── Scanner debug panel ───────────────────────────────────────────────────
  const [debugOpen, setDebugOpen]         = useState(false);
  const [lastScanMs, setLastScanMs]       = useState<number | null>(null);
  const [lastScanValue, setLastScanValue] = useState<string>("");

  // ── Refs ──────────────────────────────────────────────────────────────────
  const serialRefs    = useRef<(HTMLInputElement | null)[]>([]);
  const serialsRef    = useRef<string[]>([]);           // mirror of serials (stale-closure safe)
  const barcodesRef   = useRef<string[]>([]);
  const containerRef  = useRef<HTMLDivElement | null>(null);
  const quaggaRef     = useRef<any>(null);
  const lastScanRef   = useRef<number>(0);
  const SCAN_COOLDOWN = 1500;

  // Per-field: timestamp of first keystroke for speed detection
  const fieldInputStartRef = useRef<Record<number, number>>({});

  // ── Reset on item change ──────────────────────────────────────────────────
  const prevItemId = useRef<string | null>(null);
  if (item && item.grnItemId !== prevItemId.current) {
    prevItemId.current = item.grnItemId;
    const blank = Array(item.receivedQty).fill("");
    setSerials(blank);
    setBarcodes(blank);
    serialsRef.current  = blank;
    barcodesRef.current = blank;
    setErrors({});
    setCameraActive(false);
    setCameraReady(false);
    setCameraError(null);
    setLastScanned(null);
    fieldInputStartRef.current = {};
  }

  const required = item?.receivedQty ?? 0;
  const entered  = serials.filter(s => norm(s).length > 0).length;
  const remaining = required - entered;

  // ── Auto-focus first empty serial field when dialog opens ─────────────────
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const firstEmpty = serialsRef.current.findIndex(s => !norm(s));
      if (firstEmpty !== -1) serialRefs.current[firstEmpty]?.focus();
    }, 80);
    return () => clearTimeout(timer);
  }, [open, item?.grnItemId]);

  // ── Validate ──────────────────────────────────────────────────────────────
  function validateSerials(vals: string[]): Record<number, string> {
    const errs: Record<number, string> = {};
    const seen = new Set<string>();
    vals.forEach((raw, i) => {
      const v = norm(raw);
      if (!v) return;
      if (seen.has(v)) errs[i] = `Duplicate: '${v}' already in this batch`;
      seen.add(v);
    });
    return errs;
  }

  // ── Advance focus to next empty serial field ──────────────────────────────
  function advanceFocus(fromIdx: number) {
    const next = serialsRef.current.findIndex((s, i) => i > fromIdx && !norm(s));
    if (next !== -1) {
      serialRefs.current[next]?.focus();
    } else {
      // All filled — blur current so user knows we're done
      serialRefs.current[fromIdx]?.blur();
    }
  }

  // ── Handle serial field change ────────────────────────────────────────────
  function handleChange(i: number, value: string) {
    // Record first-keystroke time for speed detection
    if (!fieldInputStartRef.current[i] && value.length === 1) {
      fieldInputStartRef.current[i] = Date.now();
    }
    const updated = serialsRef.current.map((s, idx) => idx === i ? value : s);
    serialsRef.current = updated;
    setSerials(updated);
    setErrors(validateSerials(updated));
  }

  // ── Enter key → advance; detect machine-speed completion ─────────────────
  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = norm(serialsRef.current[i]);
      if (!v) return;
      // Record debug info
      const startMs = fieldInputStartRef.current[i];
      if (startMs) {
        const elapsed = Date.now() - startMs;
        setLastScanMs(elapsed);
        setLastScanValue(v);
        delete fieldInputStartRef.current[i];
      }
      advanceFocus(i);
    }
  }

  // Debounced auto-advance for scanners that don't send Enter.
  // If the field was empty before this edit session and the whole value
  // arrived within 50 ms per character (machine speed), advance after 150 ms.
  const autoAdvanceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  function handleChangeWithDebounce(i: number, value: string) {
    handleChange(i, value);
    clearTimeout(autoAdvanceTimers.current[i]);
    if (!value) return;
    const startMs = fieldInputStartRef.current[i] ?? Date.now();
    autoAdvanceTimers.current[i] = setTimeout(() => {
      const v = norm(value);
      if (!v) return;
      const elapsed = Date.now() - startMs;
      const msPerChar = elapsed / v.length;
      // Scanner speed: < 15 ms/char. Human typing: > 80 ms/char.
      if (msPerChar < 15) {
        setLastScanMs(elapsed);
        setLastScanValue(v);
        delete fieldInputStartRef.current[i];
        advanceFocus(i);
      }
    }, 150);
  }

  // ── Blur: check DB for duplicate ──────────────────────────────────────────
  async function handleBlur(i: number) {
    const v = norm(serialsRef.current[i]);
    if (!v || !item) return;
    try {
      const res = await apiRequest("GET", `/api/serial-numbers?productId=${item.productId}&search=${encodeURIComponent(v)}`);
      const existing: any[] = await res.json();
      if (existing.find(r => r.serialNumber === v))
        setErrors(prev => ({ ...prev, [i]: `'${v}' already registered for this product (in DB)` }));
    } catch {}
  }

  // ── Bulk paste ────────────────────────────────────────────────────────────
  function handlePaste(e: React.ClipboardEvent, startIdx: number) {
    const lines = e.clipboardData.getData("text").split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return;
    e.preventDefault();
    const updated = serialsRef.current.map((s, i) => {
      const offset = i - startIdx;
      return offset >= 0 && offset < lines.length ? lines[offset] : s;
    });
    serialsRef.current = updated;
    setSerials(updated);
    setErrors(validateSerials(updated));
    const nextEmpty = updated.findIndex((s, i) => i >= startIdx && !norm(s));
    if (nextEmpty !== -1) serialRefs.current[nextEmpty]?.focus();
  }

  // ── Stop Quagga2 ─────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (quaggaRef.current) {
      try { quaggaRef.current.stop(); } catch {}
      quaggaRef.current = null;
    }
    setCameraActive(false);
    setCameraReady(false);
  }, []);

  useEffect(() => { if (!open) stopCamera(); }, [open, stopCamera]);
  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── Camera scan → fills barcodes[] parallel array ─────────────────────────
  const handleCameraScanned = useCallback((val: string) => {
    const now = Date.now();
    if (now - lastScanRef.current < SCAN_COOLDOWN) return;

    const current = barcodesRef.current;
    const nextIdx = current.findIndex(b => !norm(b));
    if (nextIdx === -1) {
      stopCamera();
      toast({ title: "All barcodes scanned", description: "All barcode fields are filled." });
      return;
    }
    if (current.some((b, i) => i !== nextIdx && norm(b) === val)) {
      toast({ title: "Duplicate barcode", description: `'${val}' already scanned.`, variant: "destructive" });
      return;
    }
    lastScanRef.current = now;
    setPaused(true);
    setTimeout(() => setPaused(false), SCAN_COOLDOWN);

    const updated = current.map((b, i) => i === nextIdx ? val : b);
    barcodesRef.current = updated;
    flushSync(() => {
      setBarcodes(updated);
      setLastScanned(val);
    });
    if (updated.every(b => norm(b).length > 0)) stopCamera();
  }, [stopCamera, toast]);

  // ── Quagga2 LiveStream ────────────────────────────────────────────────────
  useEffect(() => {
    if (!cameraActive) return;
    const container = containerRef.current;
    if (!container) return;
    let stopped = false;

    const getMedian = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
    };

    (async () => {
      try {
        const mod = await import("@ericblade/quagga2");
        const Quagga = (mod as any).default ?? mod;
        if (stopped) return;
        quaggaRef.current = Quagga;

        const onDetected = (result: any) => {
          if (stopped) return;
          const code = result?.codeResult?.code;
          if (!code) return;
          const decodedCodes: any[] = result?.codeResult?.decodedCodes ?? [];
          const errors = decodedCodes.flatMap((x: any) => (x.error != null ? [x.error] : []));
          const median = errors.length > 0 ? getMedian(errors) : 0;
          if (median >= 0.25) return;
          handleCameraScanned(norm(code));
        };

        await new Promise<void>(r => setTimeout(r, 1));
        if (stopped) return;

        await new Promise<void>((resolve, reject) => {
          Quagga.init(
            {
              inputStream: {
                type: "LiveStream",
                target: container,
                willReadFrequently: true,
                constraints: { width: 640, height: 480, facingMode: "environment" },
                frequency: 10,
                area: { top: "10%", right: "10%", left: "10%", bottom: "10%" },
              },
              locator: { patchSize: "medium", halfSample: true },
              numOfWorkers: 0,
              decoder: {
                readers: ["code_128_reader", "code_39_reader", "code_93_reader", "codabar_reader"],
                multiple: false,
              },
              locate: false,
            },
            (err: any) => {
              if (err) { reject(err); return; }
              if (stopped) { Quagga.stop(); resolve(); return; }
              Quagga.onDetected(onDetected);
              (Quagga as any)._lastOnDetected = onDetected;
              try { Quagga.start(); } catch(e) { console.error("[Quagga] start error:", e); }
              setCameraReady(true);
              resolve();
            },
          );
        });
      } catch (err: any) {
        if (stopped) return;
        setCameraActive(false);
        const msg = (err?.message ?? String(err)).toLowerCase();
        if (msg.includes("permission") || msg.includes("denied") || msg.includes("notallowed"))
          setCameraError("Camera permission denied. Allow camera access in browser settings.");
        else if (msg.includes("notfound") || msg.includes("devicenotfound"))
          setCameraError("No camera found on this device.");
        else
          setCameraError(`Could not start camera: ${err?.message ?? err}`);
      }
    })();

    return () => {
      stopped = true;
      if (quaggaRef.current) {
        try {
          const cb = (quaggaRef.current as any)._lastOnDetected;
          if (cb) quaggaRef.current.offDetected(cb);
        } catch {}
        try { quaggaRef.current.stop(); } catch {}
        quaggaRef.current = null;
      }
      setCameraReady(false);
    };
  }, [cameraActive, handleCameraScanned]);

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!item) return;
    const normalizedSerials = serials.map(norm);
    if (normalizedSerials.some(s => !s)) {
      toast({ title: "Incomplete", description: "All serial number fields must be filled.", variant: "destructive" });
      return;
    }
    if (Object.keys(errors).length > 0) {
      toast({ title: "Fix errors first", description: "Resolve duplicate serial numbers before saving.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = normalizedSerials.map((sn, i) => ({
        serialNumber: sn,
        barcodeValue: norm(barcodes[i] ?? "") || undefined,
      }));
      const res = await apiRequest("POST", "/api/serial-numbers/bulk", {
        productId:   item.productId,
        grnId,
        grnItemId:   item.grnItemId,
        warehouseId: item.warehouseId,
        serials:     payload,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save serial numbers");
      }
      toast({ title: "Saved", description: `${normalizedSerials.length} unit(s) registered for ${item.productName}` });
      onSaved(item.grnItemId);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const hasErrors = Object.keys(errors).length > 0;
  const canSubmit = entered === required && !hasErrors && !saving;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { stopCamera(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-blue-600" />
            Enter Serial Numbers
          </DialogTitle>
          <DialogDescription>
            <strong>{item?.productName}</strong> — scan or type the serial number on each unit.
            USB/Bluetooth scanners supported — point at barcode and scan.
          </DialogDescription>
        </DialogHeader>

        {/* Live count */}
        <div className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium
          ${remaining === 0 && !hasErrors
            ? "border-green-200 bg-green-50 text-green-700 dark:bg-green-950/20 dark:border-green-800 dark:text-green-300"
            : "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300"
          }`}>
          {remaining === 0 && !hasErrors ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{required} required</span>
          <span className="text-muted-foreground">·</span>
          <span>{entered} entered</span>
          <span className="text-muted-foreground">·</span>
          <span className={remaining > 0 ? "font-bold" : ""}>{remaining} remaining</span>
        </div>

        {/* Usage hints */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ClipboardPaste className="w-3 h-3 shrink-0" />
          USB scanner or keyboard · Enter to advance · Paste multiple lines at once
        </div>

        {/* Serial number fields — primary UI */}
        <div className="space-y-2">
          {serials.map((val, i) => {
            const isValid = norm(val) && !errors[i];
            const hasBarcode = norm(barcodes[i]).length > 0;
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                  <Input
                    ref={el => { serialRefs.current[i] = el; }}
                    value={val}
                    onChange={e => handleChangeWithDebounce(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    onBlur={() => handleBlur(i)}
                    onPaste={e => handlePaste(e, i)}
                    placeholder={`Serial number for unit ${i + 1}`}
                    className={`font-mono text-sm ${
                      errors[i]    ? "border-red-400 focus-visible:ring-red-400" :
                      isValid      ? "border-green-400" : ""
                    }`}
                    data-testid={`input-serial-${i}`}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  {isValid && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                  {/* Show barcode badge if camera captured it */}
                  {hasBarcode && (
                    <span className="text-[10px] font-mono text-blue-500 shrink-0 max-w-[80px] truncate" title={barcodes[i]}>
                      📷 {barcodes[i]}
                    </span>
                  )}
                </div>
                {errors[i] && <p className="text-xs text-red-600 pl-7">{errors[i]}</p>}
              </div>
            );
          })}
        </div>

        {/* Scanner test / debug panel */}
        <div className="rounded-md border border-dashed">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
            onClick={() => setDebugOpen(v => !v)}
          >
            <span className="flex items-center gap-1.5">
              <Zap className="w-3 h-3" />
              Scanner test / debug
            </span>
            {debugOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {debugOpen && (
            <div className="px-3 pb-3 space-y-1.5 text-xs border-t">
              <p className="text-muted-foreground pt-2">
                Scan a barcode with your USB/Bluetooth scanner to test detection speed.
                Focus any serial field above, then scan.
              </p>
              {lastScanValue && (
                <div className="font-mono bg-muted/40 rounded px-2 py-1.5 space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last value:</span>
                    <span className="font-medium">{lastScanValue}</span>
                  </div>
                  {lastScanMs !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Input time:</span>
                      <span className={lastScanMs < 200 ? "text-green-600" : "text-amber-600"}>
                        {lastScanMs} ms
                        {lastScanMs < 200
                          ? " ✓ scanner speed"
                          : " — manual typing speed"}
                      </span>
                    </div>
                  )}
                  {lastScanMs !== null && lastScanValue.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ms/char:</span>
                      <span>{(lastScanMs / lastScanValue.length).toFixed(1)}</span>
                    </div>
                  )}
                </div>
              )}
              {!lastScanValue && (
                <p className="text-muted-foreground italic">No scan recorded yet.</p>
              )}
            </div>
          )}
        </div>

        {/* Camera scanning — optional / experimental */}
        <div className="rounded-md border border-dashed">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
            onClick={() => { setCameraOpen(v => !v); if (cameraActive && cameraOpen) stopCamera(); }}
          >
            <span className="flex items-center gap-1.5">
              <Camera className="w-3 h-3" />
              Mobile camera scanning
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-300 text-amber-600 bg-amber-50">
                Experimental
              </Badge>
            </span>
            {cameraOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {cameraOpen && (
            <div className="px-3 pb-3 space-y-2 border-t pt-2">
              <p className="text-xs text-muted-foreground">
                Camera scanning fills the <strong>barcode value</strong> field (stored alongside serial number).
                For reliable scanning, use a USB/Bluetooth scanner instead.
              </p>
              <Button
                size="sm"
                variant={cameraActive ? "destructive" : "outline"}
                className="gap-1.5 text-xs h-7"
                onClick={() => cameraActive ? stopCamera() : setCameraActive(true)}
                type="button"
              >
                {cameraActive
                  ? <><CameraOff className="w-3 h-3" /> Stop Camera</>
                  : <><Camera className="w-3 h-3" /> Start Camera</>}
              </Button>

              {/* Quagga2 viewport */}
              {cameraActive && (
                <div className="rounded-lg border overflow-hidden bg-black">
                  <style>{`
                    .quagga-viewport video { width:100%!important; max-height:220px; object-fit:cover; display:block; }
                    .quagga-viewport canvas.drawingBuffer { display:none; }
                    .quagga-viewport canvas { position:absolute; top:0; left:0; width:100%!important; }
                  `}</style>
                  <div ref={containerRef} className="quagga-viewport relative w-full" style={{ maxHeight: 220, overflow: "hidden" }} />
                  <div className="px-3 py-2 bg-black/90 text-xs flex items-center gap-2 min-h-[34px]">
                    {!cameraReady ? (
                      <><Loader2 className="w-3 h-3 animate-spin text-gray-400 shrink-0" /><span className="text-gray-400">Starting camera…</span></>
                    ) : lastScanned && paused ? (
                      <><CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" /><span className="text-green-300 font-mono truncate">✓ {lastScanned}</span><span className="ml-auto text-amber-400 shrink-0 text-[10px]">Move to next unit…</span></>
                    ) : lastScanned ? (
                      <><CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" /><span className="text-green-300 font-mono truncate">Last: {lastScanned}</span><span className="ml-auto text-green-400 shrink-0">{barcodes.filter(b => norm(b)).length}/{required}</span></>
                    ) : (
                      <><span className="relative flex h-2 w-2 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" /></span><span className="text-blue-300">Scanning — hold barcode horizontal &amp; centered</span></>
                    )}
                  </div>
                </div>
              )}

              {cameraError && (
                <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { stopCamera(); onClose(); }} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSubmit} data-testid="button-save-serials">
            {saving ? "Saving…" : `Save ${required} Serial${required !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
