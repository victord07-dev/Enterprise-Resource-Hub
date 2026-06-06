import React from "react";
import { createRoot } from "react-dom/client";
import type { Employee } from "@shared/schema";

// CR80 portrait card dimensions
const PDF_W_MM  = 54;
const PDF_H_MM  = 85.6;
const CARD_W_PX = 340;
const CARD_H_PX = 540;

async function renderFaceToCanvas(
  emp: Employee,
  face: "front" | "back"
): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas")).default;
  const { default: EmployeeIdCard } = await import("@/components/EmployeeIdCard");

  // Place on-screen but invisible — html2canvas requires elements to be
  // within the viewport to capture fixed/absolute positions correctly.
  const wrapper = document.createElement("div");
  wrapper.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    `width:${CARD_W_PX}px`,
    `height:${CARD_H_PX}px`,
    "overflow:hidden",
    "pointer-events:none",
    "opacity:0",
    "z-index:99999",
  ].join(";");
  document.body.appendChild(wrapper);

  const root = createRoot(wrapper);
  root.render(
    React.createElement(EmployeeIdCard, { employee: emp, captureFace: face })
  );

  // Wait for React render + QR generation (toDataURL) + image loads
  await new Promise<void>((resolve) => setTimeout(resolve, 1200));

  const faceEl = wrapper.querySelector(`[data-face="${face}"]`) as HTMLElement | null;
  if (!faceEl) {
    root.unmount();
    document.body.removeChild(wrapper);
    throw new Error(`[id-card-pdf] face element not found: ${face}`);
  }

  const canvas = await html2canvas(faceEl, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: face === "front" ? "#ffffff" : "#f3f4f7",
    width: CARD_W_PX,
    height: CARD_H_PX,
    scrollX: 0,
    scrollY: 0,
    logging: false,
  });

  root.unmount();
  document.body.removeChild(wrapper);
  return canvas;
}

export async function downloadIdCardPDF(emp: Employee) {
  const jspdfMod = await import("jspdf");
  const JsPDF = jspdfMod.default || (jspdfMod as any).jsPDF;

  // Render both faces sequentially (each in its own clean DOM container)
  const frontCanvas = await renderFaceToCanvas(emp, "front");
  const backCanvas  = await renderFaceToCanvas(emp, "back");

  const doc = new JsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [PDF_W_MM, PDF_H_MM],
  });

  doc.addImage(frontCanvas.toDataURL("image/png"), "PNG", 0, 0, PDF_W_MM, PDF_H_MM);

  doc.addPage([PDF_W_MM, PDF_H_MM], "portrait");
  doc.addImage(backCanvas.toDataURL("image/png"), "PNG", 0, 0, PDF_W_MM, PDF_H_MM);

  doc.save(`ID-Card-${emp.name.replace(/\s+/g, "-")}.pdf`);
}
