/**
 * Capture a Recharts (or any inline) <svg> DOM node as a high-DPR PNG dataURL
 * suitable for jsPDF.addImage(...). No external dependencies.
 *
 * Implementation = "Option β" (XMLSerializer + offscreen canvas).
 * - Serializes the SVG node to a Blob URL
 * - Loads via Image()
 * - Draws to an offscreen canvas sized at <css w/h × scale>
 * - Returns a PNG dataURL
 *
 * Why this works well for Recharts:
 *   Recharts emits standalone <svg> with native <text> nodes (no foreignObject).
 *   XMLSerializer round-trips cleanly. Drawing the loaded Image at scale × DPR
 *   produces crisp text/lines at A4 print size.
 */

export interface CaptureOptions {
  /** Pixel scale multiplier. 2 = 2x DPR (recommended for print). */
  scale?: number;
  /** Background fill colour for the captured PNG. Default white. */
  background?: string;
  /** 'png' (lossless, larger) or 'jpeg' (smaller, recommended for charts). Default 'png'. */
  format?: "png" | "jpeg";
  /** JPEG quality 0..1, only used when format='jpeg'. Default 0.92. */
  quality?: number;
}

export async function svgNodeToPngDataUrl(
  svg: SVGSVGElement,
  opts: CaptureOptions = {}
): Promise<{ dataUrl: string; cssWidth: number; cssHeight: number; format: "PNG" | "JPEG" }> {
  const scale = opts.scale ?? 2;
  const background = opts.background ?? "#ffffff";
  const format = opts.format ?? "png";
  const quality = opts.quality ?? 0.92;

  // Resolve the rendered CSS dimensions of the SVG (Recharts uses 100% w/h, but
  // the live DOM has computed pixel sizes via getBoundingClientRect).
  const rect = svg.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width));
  const cssHeight = Math.max(1, Math.round(rect.height));

  // Clone so we can stamp explicit width/height attrs without mutating the
  // live tree, and so we can inline computed font-family for safety.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(cssWidth));
  clone.setAttribute("height", String(cssHeight));
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  const xml = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);

    const canvas = document.createElement("canvas");
    canvas.width = cssWidth * scale;
    canvas.height = cssHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const dataUrl = format === "jpeg"
      ? canvas.toDataURL("image/jpeg", quality)
      : canvas.toDataURL("image/png");
    return { dataUrl, cssWidth, cssHeight, format: format === "jpeg" ? "JPEG" : "PNG" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Find the first <svg> inside a Recharts container. Recharts renders into
 * `<div class="recharts-wrapper"><svg class="recharts-surface">...</svg></div>`.
 */
export function findRechartsSvg(container: HTMLElement): SVGSVGElement | null {
  return container.querySelector("svg.recharts-surface") as SVGSVGElement | null
    ?? container.querySelector("svg") as SVGSVGElement | null;
}

function loadImage(src: string, timeoutMs = 8000): Promise<HTMLImageElement> {
  // Architect-flagged HIGH: capture must never hang. Bound load with timeout
  // so callers (PDF button) always either get a dataURL or a thrown error to
  // catch and degrade gracefully (PDF generates without chart image).
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const t = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Chart image load timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      reject(new Error(`Image load failed: ${String(e)}`));
    };
    img.src = src;
  });
}
