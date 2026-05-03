// Dynamic import — jsPDF + QRCode only load when the user clicks the button.
import type jsPDF from "jspdf";
import type { Employee } from "@shared/schema";

async function loadJsPDF() {
  const mod = await import("jspdf");
  return mod.default || (mod as any).jsPDF;
}

async function loadQRCode() {
  return (await import("qrcode")).default;
}
import { COMPANY } from "@shared/letterhead";
import { ensureNotoSansRegistered } from "@/lib/pdf-fonts";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export async function downloadIdCardPDF(employee: Employee) {
  let qrDataUrl: string | null = null;
  if (employee.qrCode) {
    try {
      qrDataUrl = await (await loadQRCode()).toDataURL(employee.qrCode, { width: 300, margin: 1, color: { dark: "#000000", light: "#ffffff" } });
    } catch {
    }
  }

  const W = 86;
  const H = 54;
  const doc = new (await loadJsPDF())({ orientation: "landscape", unit: "mm", format: [H, W] });
  await ensureNotoSansRegistered(doc);

  const empCode = employee.qrCode
    ? employee.qrCode.replace("NEXERP-EMP-", "").slice(0, 8).toUpperCase()
    : employee.id.slice(0, 8).toUpperCase();

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, H, "F");

  doc.setFillColor(255, 255, 255);
  for (let i = 0; i < W + H; i += 10) {
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.05);
    doc.line(i, 0, i - H, H);
  }

  doc.setFillColor(20, 40, 72);
  doc.rect(0, 0, W, 9, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.2);
  doc.line(0, 9, W, 9);

  doc.setFillColor(59, 130, 246);
  doc.roundedRect(4, 2, 5, 5, 0.8, 0.8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5);
  doc.setTextColor(255, 255, 255);
  doc.text("I", 6.5, 5.8, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(COMPANY.shortName, 11, 5.7);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(147, 197, 253);
  doc.text("EMPLOYEE ID", W - 4, 5.7, { align: "right" });

  doc.setFillColor(59, 130, 246);
  doc.circle(11, 25, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(getInitials(employee.name), 11, 27, { align: "center" });

  const textX = 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  const nameLines = doc.splitTextToSize(employee.name, 38);
  doc.text(nameLines[0], textX, 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(147, 197, 253);
  doc.text(employee.designation, textX, 22);

  doc.setFontSize(5.5);
  doc.setTextColor(200, 215, 235);
  const deptLine = [employee.department, employee.company].filter(Boolean).join(" · ");
  doc.text(deptLine, textX, 27);

  doc.setFillColor(30, 58, 110);
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.3);
  doc.roundedRect(textX, 30, 20, 5, 0.8, 0.8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(147, 197, 253);
  doc.text(`#${empCode}`, textX + 2, 33.5);

  if (employee.joinDate) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(180, 200, 225);
    const sinceText = `Since ${new Date(employee.joinDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`;
    doc.text(sinceText, textX + 23, 33.5);
  }

  if (qrDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(W - 24, 11, 20, 20, 1, 1, "F");
    doc.addImage(qrDataUrl, "PNG", W - 23.5, 11.5, 19, 19);
  } else {
    doc.setFillColor(30, 50, 80);
    doc.roundedRect(W - 24, 11, 20, 20, 1, 1, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(120, 150, 190);
    doc.text("No QR", W - 14, 22, { align: "center" });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.5);
  doc.setTextColor(120, 150, 190);
  doc.text("SCAN TO CHECK IN", W - 14, 34, { align: "center" });

  doc.setFillColor(0, 0, 0);
  doc.rect(0, H - 7, W, 7, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.2);
  doc.line(0, H - 7, W, H - 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.5);
  doc.setTextColor(120, 150, 190);
  doc.text(employee.phone || employee.email || "", 4, H - 3.5);
  doc.text("ITFI ERP System", W - 4, H - 3.5, { align: "right" });

  const safeName = employee.name.replace(/\s+/g, "-");
  doc.save(`ID-Card-${safeName}.pdf`);
}
