/**
 * Phase 4C P1 — Client-side NotoSans font registration for jsPDF.
 *
 * Lazy-fetches NotoSans-Regular.ttf + NotoSans-Bold.ttf from /fonts/ on
 * first use (cached in a module-level promise — only one network round-trip
 * per browser session no matter how many PDFs the user generates).
 *
 * Then monkey-patches the supplied doc instance's setFont method so any
 * existing `doc.setFont("helvetica", ...)` call transparently uses
 * NotoSans instead — fixes ₹ / Δ / em-dash rendering across ALL existing
 * PDF generators without touching their internal setFont calls.
 *
 * Usage in every PDF generator:
 *
 *   const doc = new (await loadJsPDF())({ ... });
 *   await ensureNotoSansRegistered(doc);   // <-- add this one line
 *   // ...rest of generator unchanged
 */

let cachedRegularB64: string | null = null;
let cachedBoldB64: string | null = null;
let loadPromise: Promise<void> | null = null;

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  // Convert ArrayBuffer -> base64 (no Buffer in browser)
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000; // chunked to avoid call-stack overflow
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFontsOnce(): Promise<void> {
  if (cachedRegularB64 && cachedBoldB64) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      const [reg, bold] = await Promise.all([
        fetchAsBase64("/fonts/NotoSans-Regular.ttf"),
        fetchAsBase64("/fonts/NotoSans-Bold.ttf"),
      ]);
      cachedRegularB64 = reg;
      cachedBoldB64 = bold;
    })();
  }
  await loadPromise;
}

function patchSetFont(doc: any) {
  if (doc.__notoPatched) return;
  const origSetFont = doc.setFont.bind(doc);
  doc.setFont = (...args: any[]) => {
    const font = args[0];
    const style = args[1];
    if (font === "helvetica" || font === "Helvetica") {
      if (style === "bold")    return origSetFont("NotoSans", "bold");
      if (style === "italic")  return origSetFont("NotoSans", "normal"); // no italic variant — fall back
      return origSetFont("NotoSans", "normal");
    }
    return origSetFont(...args);
  };
  doc.__notoPatched = true;
}

/**
 * Register NotoSans on the supplied jsPDF doc and patch its setFont method.
 * Safe to call multiple times per doc (no-op after first registration).
 * Falls back silently to default helvetica if font fetch fails (e.g. offline).
 */
export async function ensureNotoSansRegistered(doc: any): Promise<void> {
  try {
    await loadFontsOnce();
    if (!cachedRegularB64 || !cachedBoldB64) return;
    doc.addFileToVFS("NotoSans-Regular.ttf", cachedRegularB64);
    doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
    doc.addFileToVFS("NotoSans-Bold.ttf", cachedBoldB64);
    doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
    patchSetFont(doc);
  } catch (err) {
    // Silent fallback to helvetica — existing PDFs still render, just with
    // ₹ → ¹ regression. Surfaces in console for ops awareness.
    // eslint-disable-next-line no-console
    console.warn("[pdf-fonts] NotoSans registration failed, falling back to helvetica:", err);
  }
}
