import jsPDF from "jspdf";
import type { PurchaseOrder, PurchaseOrderItem, Supplier } from "@shared/schema";

const COLORS = {
  headerBg: [30, 41, 59] as [number, number, number],
  headerText: [255, 255, 255] as [number, number, number],
  accent: [59, 130, 246] as [number, number, number],
  textPrimary: [15, 23, 42] as [number, number, number],
  textSecondary: [100, 116, 139] as [number, number, number],
  tableBorder: [226, 232, 240] as [number, number, number],
  tableHeader: [241, 245, 249] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

function formatCurrency(val: number | string): string {
  return `Rs. ${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number) {
  doc.roundedRect(x, y, w, h, r, r, "F");
}

export function generatePurchaseOrderPDF(
  po: PurchaseOrder,
  items: PurchaseOrderItem[],
  supplier: Supplier | undefined
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, pageWidth, 48, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.headerText);
  doc.text("ITFI Group", margin, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(180, 190, 210);
  doc.text("A subsidiary of ITFI Group", margin, 24);

  doc.setFontSize(7.5);
  doc.text("admin@itfi.co.in", pageWidth - margin, 15, { align: "right" });
  doc.text("www.itfi.co.in", pageWidth - margin, 20, { align: "right" });

  doc.setFillColor(59, 130, 246);
  doc.rect(0, 34, pageWidth, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.white);
  doc.text("PURCHASE ORDER", pageWidth / 2, 42.5, { align: "center" });

  y = 56;

  const hasDeliveryAddr = !!(po as any).deliveryAddress;
  const detailsBoxHeight = hasDeliveryAddr ? 36 : 28;
  doc.setFillColor(248, 250, 252);
  drawRoundedRect(doc, margin, y, contentWidth, detailsBoxHeight, 2);

  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("PO Number", margin + 4, y + 6);
  doc.text("Order Date", margin + 50, y + 6);
  doc.text("Expected Delivery", margin + 90, y + 6);
  doc.text("Delivery Type", margin + 135, y + 6);
  doc.text("Status", pageWidth - margin - 4, y + 6, { align: "right" });

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFont("helvetica", "bold");
  doc.text(po.poNumber, margin + 4, y + 12);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(po.orderDate).toLocaleDateString("en-IN"), margin + 50, y + 12);
  doc.text(po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString("en-IN") : "—", margin + 90, y + 12);
  doc.text(po.deliveryType === "direct_delivery" ? "Direct Delivery" : "Warehouse", margin + 135, y + 12);

  const statusLabel = po.status.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  doc.text(statusLabel, pageWidth - margin - 4, y + 12, { align: "right" });

  if (supplier) {
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("Vendor", margin + 4, y + 19);

    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textPrimary);
    doc.setFont("helvetica", "bold");
    doc.text(supplier.name, margin + 4, y + 24);
    doc.setFont("helvetica", "normal");

    const vendorDetails: string[] = [];
    if (supplier.contactPerson) vendorDetails.push(supplier.contactPerson);
    if (supplier.phone) vendorDetails.push(supplier.phone);
    if (supplier.email) vendorDetails.push(supplier.email);
    if (supplier.gstNumber) vendorDetails.push(`GST: ${supplier.gstNumber}`);
    if (vendorDetails.length > 0) {
      doc.setFontSize(7.5);
      doc.text(vendorDetails.join("  |  "), margin + 55, y + 24);
    }
    if (supplier.address) {
      doc.setFontSize(7.5);
      doc.setTextColor(...COLORS.textSecondary);
      const addressLines = doc.splitTextToSize(supplier.address, 120);
      doc.text(addressLines, pageWidth - margin - 4, y + 19, { align: "right" });
    }
  }

  if (hasDeliveryAddr) {
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("Deliver To:", margin + 4, y + 29);
    doc.setFontSize(8);
    doc.setTextColor(COLORS.accent[0], COLORS.accent[1], COLORS.accent[2]);
    doc.setFont("helvetica", "bold");
    const addrText = doc.splitTextToSize((po as any).deliveryAddress, 130);
    doc.text(addrText[0] || "", margin + 25, y + 29);
    doc.setFont("helvetica", "normal");
    y += detailsBoxHeight + 6;
  } else {
    y += 34;
  }

  const colX = {
    no: margin,
    desc: margin + 10,
    qty: margin + 115,
    unit: margin + 135,
    total: pageWidth - margin,
  };
  const tableHeaderH = 8;

  doc.setFillColor(...COLORS.tableHeader);
  drawRoundedRect(doc, margin, y, contentWidth, tableHeaderH, 1);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("#", colX.no + 2, y + 5.5);
  doc.text("Description", colX.desc, y + 5.5);
  doc.text("Qty", colX.qty, y + 5.5, { align: "right" });
  doc.text("Unit Cost", colX.unit + 15, y + 5.5, { align: "right" });
  doc.text("Total", colX.total - 2, y + 5.5, { align: "right" });

  y += tableHeaderH;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  let subtotal = 0;
  items.forEach((item, idx) => {
    const rowH = 7;
    const maxPageY = doc.internal.pageSize.getHeight() - 40;
    if (y + rowH > maxPageY) {
      doc.addPage();
      y = 20;
    }

    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, rowH, "F");
    }

    doc.setDrawColor(...COLORS.tableBorder);
    doc.line(margin, y + rowH, pageWidth - margin, y + rowH);

    doc.setTextColor(...COLORS.textPrimary);
    doc.text(String(idx + 1), colX.no + 2, y + 5);

    const descText = doc.splitTextToSize(item.description || "—", 100);
    doc.text(descText[0], colX.desc, y + 5);
    doc.text(String(item.quantity), colX.qty, y + 5, { align: "right" });
    doc.text(formatCurrency(item.unitCost), colX.unit + 15, y + 5, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrency(item.totalCost), colX.total - 2, y + 5, { align: "right" });
    doc.setFont("helvetica", "normal");

    subtotal += Number(item.totalCost);
    y += rowH;
  });

  y += 4;

  const summaryX = pageWidth - margin - 80;
  const summaryWidth = 80;

  doc.setFillColor(248, 250, 252);
  drawRoundedRect(doc, summaryX, y, summaryWidth, 18, 2);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Subtotal", summaryX + 4, y + 6);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(formatCurrency(subtotal), summaryX + summaryWidth - 4, y + 6, { align: "right" });

  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(summaryX + 4, y + 9, summaryX + summaryWidth - 4, y + 9);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text("Grand Total", summaryX + 4, y + 15);
  doc.text(formatCurrency(po.totalAmount), summaryX + summaryWidth - 4, y + 15, { align: "right" });

  y += 18;

  if (po.notes) {
    y += 8;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("NOTES", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textPrimary);
    const noteLines = doc.splitTextToSize(po.notes, contentWidth - 10);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4;
  }

  y += 10;
  const termsY = Math.max(y, doc.internal.pageSize.getHeight() - 35);
  doc.setDrawColor(...COLORS.tableBorder);
  doc.line(margin, termsY, pageWidth - margin, termsY);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("TERMS & CONDITIONS", margin, termsY + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text("1. Delivery must be made by the expected delivery date unless agreed otherwise.", margin, termsY + 10);
  doc.text("2. All goods must meet the agreed quality standards and specifications.", margin, termsY + 14);
  doc.text("3. Payment terms as per the existing agreement with the supplier.", margin, termsY + 18);

  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text("This is a system-generated purchase order and does not require a signature.", pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });

  doc.save(`${po.poNumber}.pdf`);
}
