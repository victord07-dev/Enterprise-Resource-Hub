async function loadJsPDF() {
  const mod = await import("jspdf");
  return mod.default || (mod as any).jsPDF;
}

export interface PayslipData {
  employeeName: string;
  employeeId: string;
  designation: string;
  department: string;
  company: string;
  month: string;
  year: number;
  workingDays: number;
  fullDays: number;
  halfDays: number;
  daysAbsent: number;
  monthlySalary: number;
  dailyRate: number;
  earnedSalary: number;
  incentiveAmt: number;
  incentiveDates: string[];
  advanceDeduct: number;
  advanceDates: string[];
  unrecoveredAdvance: number;
  deductions: number;
  netPay: number;
}

function fmt(n: number) {
  return `Rs.${n.toLocaleString("en-IN")}`;
}

export async function downloadPayslipPDF(data: PayslipData) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a5" });

  const W = 148;
  const margin = 12;
  const contentW = W - margin * 2;
  let y = 0;

  // Header background
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 38, "F");

  // Company logo placeholder
  doc.setFillColor(59, 130, 246);
  doc.roundedRect(margin, 7, 8, 8, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text("I", margin + 4, 12.5, { align: "center" });

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(data.company || "Hussain Enterprise", margin + 10, 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text("Hussain Enterprise", margin + 10, 15);

  // Contact info right
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text("info@hussainenterprise.cloud", W - margin, 11, { align: "right" });
  doc.text("erp.hussainenterprise.cloud", W - margin, 15, { align: "right" });

  // Divider
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.3);
  doc.line(margin, 20, W - margin, 20);

  // PAYSLIP title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("PAYSLIP", W / 2, 26, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`${data.month} ${data.year}`, W / 2, 31, { align: "center" });

  y = 44;

  // Employee info grid
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Employee Name", margin, y);
  doc.text("Employee ID", W / 2 + 2, y);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(data.employeeName, margin, y);
  doc.setFontSize(6);
  const empIdText = `EMP-${data.employeeId.slice(0, 18)}`;
  doc.text(empIdText, W / 2 + 2, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Designation", margin, y);
  doc.text("Department", W / 2 + 2, y);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text(data.designation || "-", margin, y);
  doc.text(data.department || "-", W / 2 + 2, y);
  y += 7;

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin, y);
  y += 5;

  // Attendance section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("ATTENDANCE SUMMARY", margin, y);
  y += 4;

  const boxW = contentW / 4 - 1;
  const boxes = [
    { label: "WORKING", val: String(data.workingDays), color: [71, 85, 105] as [number,number,number], bg: [241, 245, 249] as [number,number,number] },
    { label: "PRESENT", val: String(data.fullDays), color: [5, 150, 105] as [number,number,number], bg: [236, 253, 245] as [number,number,number] },
    { label: "HALF DAY", val: String(data.halfDays), color: [217, 119, 6] as [number,number,number], bg: [255, 251, 235] as [number,number,number] },
    { label: "ABSENT", val: String(data.daysAbsent), color: [220, 38, 38] as [number,number,number], bg: [254, 242, 242] as [number,number,number] },
  ];
  boxes.forEach((b, i) => {
    const bx = margin + i * (boxW + 1.3);
    doc.setFillColor(...b.bg);
    doc.roundedRect(bx, y, boxW, 11, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...b.color);
    doc.text(b.val, bx + boxW / 2, y + 5.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(100, 116, 139);
    doc.text(b.label, bx + boxW / 2, y + 9.5, { align: "center" });
  });
  y += 15;

  // Earnings & Deductions section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("EARNINGS & DEDUCTIONS", margin, y);
  y += 4;

  const rows: Array<{ label: string; value: string; color?: [number, number, number]; bg?: [number, number, number] }> = [
    { label: "Monthly Salary (Gross)", value: fmt(data.monthlySalary), bg: [248, 250, 252] },
    { label: `Daily Rate (Salary / 26)`, value: fmt(data.dailyRate) },
    { label: `Full Days (${data.fullDays} × ${fmt(data.dailyRate)})`, value: fmt(data.fullDays * data.dailyRate), color: [5, 150, 105], bg: [248, 250, 252] },
    { label: `Half Days (${data.halfDays} × ${fmt(Math.round(data.dailyRate / 2))})`, value: fmt(data.halfDays * Math.round(data.dailyRate / 2)), color: [217, 119, 6] },
  ];

  if (data.incentiveAmt > 0) {
    const iLabel = data.incentiveDates && data.incentiveDates.length > 0
      ? `Incentive / Bonus (${data.incentiveDates.slice(0, 2).join(", ")}${data.incentiveDates.length > 2 ? "..." : ""})`
      : "Incentive / Bonus";
    rows.push({ label: iLabel, value: `+${fmt(data.incentiveAmt)}`, color: [5, 150, 105], bg: [236, 253, 245] });
  }

  rows.push({ label: "Attendance Deduction", value: data.deductions > 0 ? `-${fmt(data.deductions)}` : "—", color: data.deductions > 0 ? [220, 38, 38] : undefined, bg: [248, 250, 252] });

  if (data.advanceDeduct > 0) {
    const advLabel = data.advanceDates.length > 0
      ? `Advance Deduction (${data.advanceDates.slice(0, 2).join(", ")}${data.advanceDates.length > 2 ? "..." : ""})`
      : "Advance Deduction";
    rows.push({ label: advLabel, value: `-${fmt(data.advanceDeduct)}`, color: [220, 38, 38] });
  }

  rows.forEach((row, i) => {
    if (row.bg) {
      doc.setFillColor(...row.bg);
      doc.rect(margin, y, contentW, 7, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    if (row.color) {
      doc.setTextColor(...row.color);
    } else {
      doc.setTextColor(71, 85, 105);
    }
    doc.text(row.label, margin + 2, y + 4.5);
    doc.setFont("helvetica", "bold");
    doc.text(row.value, W - margin - 2, y + 4.5, { align: "right" });
    y += 7;
  });

  // Border around earnings table
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.rect(margin, y - rows.length * 7, contentW, rows.length * 7);
  y += 2;

  // Unrecovered advance note
  if (data.unrecoveredAdvance > 0) {
    doc.setFillColor(255, 247, 237);
    doc.setDrawColor(251, 146, 60);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentW, 8, 1, 1, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(194, 65, 12);
    doc.text(`Unrecovered Advance: ${fmt(data.unrecoveredAdvance)} — will be deducted in next payroll`, margin + 2, y + 5);
    y += 11;
  }

  y += 2;

  // Net Payable footer bar
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y, contentW, 12, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("NET PAYABLE", margin + 4, y + 7.5);
  doc.setFontSize(10);
  doc.text(fmt(data.netPay), W - margin - 4, y + 7.5, { align: "right" });
  y += 16;

  // Footer note
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(148, 163, 184);
  doc.text("This is a system-generated payslip and does not require a signature.", W / 2, y, { align: "center" });

  const safeName = data.employeeName.replace(/\s+/g, "-");
  doc.save(`Payslip-${safeName}-${data.month}-${data.year}.pdf`);
}
