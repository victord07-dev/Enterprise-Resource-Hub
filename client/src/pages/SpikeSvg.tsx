import { useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { findRechartsSvg, svgNodeToPngDataUrl } from "@/lib/chart-to-image";

const trendData = [
  { month: "Jun '25", revenue: 320000, expense: 180000, profit: 140000 },
  { month: "Jul '25", revenue: 410000, expense: 220000, profit: 190000 },
  { month: "Aug '25", revenue: 380000, expense: 210000, profit: 170000 },
  { month: "Sep '25", revenue: 460000, expense: 250000, profit: 210000 },
  { month: "Oct '25", revenue: 520000, expense: 290000, profit: 230000 },
  { month: "Nov '25", revenue: 480000, expense: 270000, profit: 210000 },
  { month: "Dec '25", revenue: 510000, expense: 280000, profit: 230000 },
  { month: "Jan '26", revenue: 540000, expense: 300000, profit: 240000 },
  { month: "Feb '26", revenue: 470000, expense: 260000, profit: 210000 },
  { month: "Mar '26", revenue: 590000, expense: 320000, profit: 270000 },
  { month: "Apr '26", revenue: 620000, expense: 340000, profit: 280000 },
  { month: "May '26", revenue: 680000, expense: 370000, profit: 310000 },
];

const donutData = [
  { name: "Loading / Unloading", value: 1000 },
  { name: "Office Supplies", value: 50 },
  { name: "Travel", value: 850 },
  { name: "Utilities", value: 1200 },
  { name: "Misc", value: 320 },
];
const DONUT_COLORS = ["#1e3a8a", "#0ea5e9", "#10b981", "#f59e0b", "#6366f1"];

export default function SpikeSvg() {
  const barRef = useRef<HTMLDivElement>(null);
  const donutRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    setBusy(true);
    setStatus("Capturing charts...");
    try {
      const barSvg = barRef.current && findRechartsSvg(barRef.current);
      const donutSvg = donutRef.current && findRechartsSvg(donutRef.current);
      if (!barSvg || !donutSvg) {
        setStatus("ERR: SVG not found in Recharts container");
        return;
      }

      const t0 = performance.now();
      const bar = await svgNodeToPngDataUrl(barSvg, { scale: 2 });
      const donut = await svgNodeToPngDataUrl(donutSvg, { scale: 2 });
      const captureMs = Math.round(performance.now() - t0);

      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("SVG Capture Fidelity Spike (β: XMLSerializer + canvas)", 14, 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Method: serialize SVG → Image() → canvas @ 2x DPR → addImage`, 14, 25);
      doc.text(`Capture time: ${captureMs}ms (both charts)`, 14, 31);
      doc.text(`Bar: css ${bar.cssWidth}×${bar.cssHeight}px → PNG ${bar.cssWidth*2}×${bar.cssHeight*2}px`, 14, 37);

      // Bar chart embed: scale to ~180mm wide, preserve aspect
      const barWmm = 180;
      const barHmm = (bar.cssHeight / bar.cssWidth) * barWmm;
      doc.addImage(bar.dataUrl, "PNG", 14, 44, barWmm, barHmm);

      // Donut below
      const donutWmm = 90;
      const donutHmm = (donut.cssHeight / donut.cssWidth) * donutWmm;
      doc.addImage(donut.dataUrl, "PNG", 14, 44 + barHmm + 8, donutWmm, donutHmm);

      doc.save(`spike-svg-${Date.now()}.pdf`);
      setStatus(`OK: PDF downloaded. Capture=${captureMs}ms. Open PDF, zoom 200%+, eyeball axis labels & bar edges.`);
    } catch (e: any) {
      setStatus(`FAIL: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto" data-testid="spike-svg-page">
      <div>
        <h1 className="text-2xl font-bold">SVG → PDF Capture Spike</h1>
        <p className="text-sm text-muted-foreground">
          Phase 0 fidelity check. Renders 2 Recharts SVGs, captures via XMLSerializer + canvas at 2x DPR,
          embeds in jsPDF. Eyeball the downloaded PDF before greenlighting full P&L build.
        </p>
      </div>

      <Button onClick={handleDownload} disabled={busy} data-testid="button-spike-download">
        {busy ? "Capturing..." : "Download Test PDF"}
      </Button>

      {status && (
        <div
          className={`p-3 rounded text-sm ${status.startsWith("OK") ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : status.startsWith("FAIL") || status.startsWith("ERR") ? "bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200" : "bg-muted"}`}
          data-testid="status-spike"
        >
          {status}
        </div>
      )}

      {/* Live charts (these are what get captured) */}
      <div className="border rounded p-3 bg-card" data-testid="chart-bar-container">
        <div className="text-sm font-semibold mb-2">12-Month Revenue / Expense / Profit (sample data)</div>
        <div ref={barRef} style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip />
              <Legend />
              <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
              <Bar dataKey="expense" fill="#ef4444" name="Expense" />
              <Bar dataKey="profit" fill="#1e3a8a" name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="border rounded p-3 bg-card" data-testid="chart-donut-container">
        <div className="text-sm font-semibold mb-2">Expense Breakdown (sample data)</div>
        <div ref={donutRef} style={{ width: 360, height: 240 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label>
                {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
