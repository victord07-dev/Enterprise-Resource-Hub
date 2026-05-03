/**
 * Phase 4C P1 — Server-side NotoSans font registration for jsPDF.
 *
 * Reads NotoSans-Regular.ttf + NotoSans-Bold.ttf from disk ONCE at module
 * load (synchronous; ~1.6MB held in memory as base64). Then exposes
 * `ensureNotoSansRegistered(doc)` which registers the cached fonts on
 * the supplied doc and monkey-patches doc.setFont to redirect helvetica
 * → NotoSans.
 *
 * Mirrors `client/src/lib/pdf-fonts.ts` — same patching contract so a
 * single shared `drawLetterhead(doc, ...)` call renders identically on
 * both client and server.
 */

import * as fs from "node:fs";
import * as path from "node:path";

function findFontFile(name: string): string | null {
  // Order matters: production build first (dist/public), dev second (client/public),
  // explicit asset folder third (defensive).
  const candidates = [
    path.join(process.cwd(), "dist", "public", "fonts", name),
    path.join(process.cwd(), "client", "public", "fonts", name),
    path.join(process.cwd(), "public", "fonts", name),
  ];
  return candidates.find((p) => {
    try { return fs.statSync(p).isFile(); } catch { return false; }
  }) ?? null;
}

function loadFontB64(name: string): string | null {
  const p = findFontFile(name);
  if (!p) {
    // eslint-disable-next-line no-console
    console.warn(`[pdf-fonts] Font ${name} not found in any expected location.`);
    return null;
  }
  try {
    return fs.readFileSync(p).toString("base64");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[pdf-fonts] Failed to read ${p}:`, err);
    return null;
  }
}

const REGULAR_B64 = loadFontB64("NotoSans-Regular.ttf");
const BOLD_B64    = loadFontB64("NotoSans-Bold.ttf");

function patchSetFont(doc: any) {
  if (doc.__notoPatched) return;
  const origSetFont = doc.setFont.bind(doc);
  doc.setFont = (...args: any[]) => {
    const font = args[0];
    const style = args[1];
    if (font === "helvetica" || font === "Helvetica") {
      if (style === "bold")   return origSetFont("NotoSans", "bold");
      if (style === "italic") return origSetFont("NotoSans", "normal");
      return origSetFont("NotoSans", "normal");
    }
    return origSetFont(...args);
  };
  doc.__notoPatched = true;
}

/**
 * Register NotoSans on the supplied jsPDF doc and patch setFont. Synchronous
 * — fonts are already cached in memory at module load. Safe to call
 * multiple times per doc.
 */
export function ensureNotoSansRegistered(doc: any): void {
  if (!REGULAR_B64 || !BOLD_B64) return; // silent fallback to helvetica
  try {
    doc.addFileToVFS("NotoSans-Regular.ttf", REGULAR_B64);
    doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
    doc.addFileToVFS("NotoSans-Bold.ttf", BOLD_B64);
    doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
    patchSetFont(doc);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[pdf-fonts] Server-side NotoSans registration failed:", err);
  }
}
