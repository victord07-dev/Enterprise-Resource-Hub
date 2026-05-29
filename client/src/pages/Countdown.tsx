import { useState, useEffect, useCallback, useRef } from "react";
import itfiLogoUrl from "@assets/HE-LOGO.jpeg";

/* ─── types ─────────────────────────────────────────────────────────────── */
interface CountdownData {
  month: string;
  monthName: string;
  monthEndISO: string;
  serverTimeISO: string;
  salesTarget: string;
  salesAchieved: string;
  solarCustomersTarget: number;
  solarCustomersAchieved: number;
  updatedAt: string;
}
interface TimeLeft { days: number; hours: number; minutes: number; seconds: number; }

/* ─── helpers ────────────────────────────────────────────────────────────── */
function computeTimeLeft(endISO: string): TimeLeft {
  const diff = Math.max(0, new Date(endISO).getTime() - Date.now());
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}
function pad(n: number) { return String(n).padStart(2, "0"); }
function fmtCr(v: number): string {
  if (v === 0) return "₹0";
  const cr = v / 1e7;
  return "₹" + (cr >= 1 ? cr.toFixed(2) + " Cr" : (v / 1e5).toFixed(2) + " L");
}
function fmtUpdated(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

/* ─── design tokens ──────────────────────────────────────────────────────── */
const G = {
  green:      "#1AA64B",
  greenDeep:  "#0E8C3C",
  greenSoft:  "#e7f6ec",
  blue:       "#1769C0",
  blueDeep:   "#0F4F97",
  blueSoft:   "#e8f1fb",
  orange:     "#EF5A1E",
  ink:        "#16243a",
  inkSoft:    "#5a6b80",
  inkFaint:   "#93a1b3",
  line:       "#e7ecf3",
  gradGb:     "linear-gradient(120deg,#1AA64B 0%,#14A07B 42%,#1769C0 100%)",
  gradBar:    "linear-gradient(90deg,#1AA64B 0%,#1769C0 55%,#EF5A1E 100%)",
  shadow:     "0 1px 2px rgba(22,36,58,.04),0 18px 40px -22px rgba(22,36,58,.22)",
  shadowSm:   "0 1px 2px rgba(22,36,58,.05),0 8px 22px -16px rgba(22,36,58,.25)",
};

/* ─── component ──────────────────────────────────────────────────────────── */
export default function Countdown() {
  const [data,     setData]     = useState<CountdownData | null>(null);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [error,    setError]    = useState(false);
  const prevTime = useRef<TimeLeft>({ days: -1, hours: -1, minutes: -1, seconds: -1 });
  const [flips, setFlips] = useState({ d: false, h: false, m: false, s: false });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/public/countdown");
      if (!res.ok) throw new Error();
      const json: CountdownData = await res.json();
      setData(json);
      setTimeLeft(computeTimeLeft(json.monthEndISO));
      setError(false);
    } catch { setError(true); }
  }, []);

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 5 * 60 * 1000); return () => clearInterval(id); }, [fetchData]);

  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => {
      const t = computeTimeLeft(data.monthEndISO);
      const p = prevTime.current;
      setFlips({
        d: t.days    !== p.days,
        h: t.hours   !== p.hours,
        m: t.minutes !== p.minutes,
        s: t.seconds !== p.seconds,
      });
      prevTime.current = t;
      setTimeLeft(t);
    }, 1000);
    return () => clearInterval(id);
  }, [data]);

  const salesTarget   = data ? Number(data.salesTarget)   : 50_000_000;
  const salesAchieved = data ? Number(data.salesAchieved) : 0;
  const salesPct      = salesTarget > 0 ? Math.min(100, (salesAchieved / salesTarget) * 100) : 0;
  const chipLabel     = salesPct >= 100 ? "Achieved" : salesPct >= 50 ? "On track" : "Ramping up";
  const pctColor      = salesPct >= 75 ? G.greenDeep : salesPct >= 35 ? G.blueDeep : G.orange;

  const solarTarget   = data ? data.solarCustomersTarget   : 35;
  const solarAchieved = data ? data.solarCustomersAchieved : 0;
  const solarPct      = solarTarget > 0 ? Math.min(100, (solarAchieved / solarTarget) * 100) : 0;
  const solarRemain   = Math.max(0, solarTarget - solarAchieved);

  const tiles = [
    { id: "d", label: "Days",    value: timeLeft.days,    flip: flips.d },
    { id: "h", label: "Hours",   value: timeLeft.hours,   flip: flips.h },
    { id: "m", label: "Minutes", value: timeLeft.minutes, flip: flips.m },
    { id: "s", label: "Seconds", value: timeLeft.seconds, flip: flips.s },
  ] as const;

  return (
    <>
      {/* ── keyframe styles ── */}
      <style>{`
        @keyframes cd-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(26,166,75,.45); }
          70%  { box-shadow: 0 0 0 9px rgba(26,166,75,0); }
          100% { box-shadow: 0 0 0 0 rgba(26,166,75,0); }
        }
        @keyframes cd-flip {
          0%   { transform: translateY(-6px) scale(1.04); opacity: .35; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes cd-shimmer {
          0%       { transform: translateX(-100%); }
          55%,100% { transform: translateX(320%); }
        }
        .cd-flip-anim { animation: cd-flip .5s ease; }
        .cd-live-dot  { animation: cd-pulse 2.4s infinite; }
        .cd-shimmer::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.8), transparent);
          transform: translateX(-100%);
          animation: cd-shimmer 3.2s ease-in-out infinite;
        }
      `}</style>

      <div style={{
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: G.ink,
        background: `
          radial-gradient(1100px 620px at 8% -8%,rgba(26,166,75,.09),transparent 60%),
          radial-gradient(1100px 680px at 98% 4%,rgba(23,105,192,.10),transparent 58%),
          radial-gradient(900px 600px at 80% 108%,rgba(239,90,30,.07),transparent 60%),
          #f5f8fc`,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        WebkitFontSmoothing: "antialiased",
      }}>

        {/* ── top bar ── */}
        <div style={{ height: 5, background: G.gradBar }} />

        {/* ── header ── */}
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 24, padding: "10px 48px",
          background: "rgba(255,255,255,.72)",
          backdropFilter: "blur(10px)",
          borderBottom: `1px solid ${G.line}`,
        }}>
          <img src={itfiLogoUrl} alt="Hussain Enterprise" style={{ height: 84, width: "auto", maxWidth: "100%", display: "block" }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 34, fontWeight: 700, letterSpacing: "-.01em", color: G.ink }}>
              {data?.monthName ?? "—"}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, fontSize: 13.5, color: G.inkSoft, marginTop: 3 }}>
              <span className="cd-live-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: G.green, display: "inline-block" }} />
              Last updated:&nbsp;
              <span>{data?.updatedAt ? fmtUpdated(data.updatedAt) : "—"}</span>
              {error && <span style={{ color: G.orange, fontWeight: 700 }}>⚠ reconnecting…</span>}
            </div>
          </div>
        </header>

        {/* ── main ── */}
        <main style={{ flex: 1, width: "100%", maxWidth: 1320, margin: "0 auto", padding: "40px 48px 28px", display: "flex", flexDirection: "column", gap: 34 }}>

          {/* countdown */}
          <section>
            <div style={{ textAlign: "center", fontSize: 15, fontWeight: 700, letterSpacing: ".42em", textTransform: "uppercase", color: G.orange, paddingLeft: ".42em" }}>
              Time Remaining This Month
            </div>
            <div style={{ display: "flex", alignItems: "stretch", justifyContent: "center", gap: 14, marginTop: 22 }}>
              {tiles.map((t, i) => (
                <>
                  {i > 0 && (
                    <div key={`sep-${i}`} style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 11, padding: "0 4px" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: G.green, opacity: .5, display: "block" }} />
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: G.blue, opacity: .5, display: "block" }} />
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: G.orange, opacity: .5, display: "block" }} />
                    </div>
                  )}
                  <div key={t.id} style={{
                    position: "relative", width: 208, padding: "26px 10px 20px",
                    background: "#fff", border: `1px solid ${G.line}`,
                    borderRadius: 22, boxShadow: G.shadow,
                    textAlign: "center", overflow: "hidden",
                  }}>
                    {/* gradient top accent */}
                    <div style={{ position: "absolute", inset: "0 0 auto 0", height: 5, background: G.gradGb, opacity: .92 }} />
                    <div
                      key={`${t.id}-${t.value}`}
                      className={t.flip ? "cd-flip-anim" : ""}
                      style={{
                        fontFamily: "'Space Grotesk',sans-serif",
                        fontSize: 92, fontWeight: 700, lineHeight: 1,
                        letterSpacing: "-.02em",
                        fontVariantNumeric: "tabular-nums",
                        background: G.gradGb,
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        color: "transparent",
                      }}
                    >
                      {pad(t.value)}
                    </div>
                    <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, letterSpacing: ".22em", textTransform: "uppercase", color: G.inkFaint }}>
                      {t.label}
                    </div>
                  </div>
                </>
              ))}
            </div>
          </section>

          {/* sales target */}
          <section style={{
            position: "relative", background: "#fff", border: `1px solid ${G.line}`,
            borderRadius: 22, boxShadow: G.shadow, padding: "30px 34px", overflow: "hidden",
          }}>
            {/* green left border */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: `linear-gradient(${G.green},${G.greenDeep})` }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14.5, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: G.greenDeep }}>
                  Monthly Sales Target
                  <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, fontWeight: 700, letterSpacing: ".08em", background: G.greenSoft, color: G.greenDeep }}>
                    {chipLabel}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 18 }}>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 40, fontWeight: 700, color: G.ink, letterSpacing: "-.01em" }}>
                    {fmtCr(salesAchieved)}
                  </span>
                  <span style={{ fontSize: 19, color: G.inkSoft, fontWeight: 600 }}>
                    / {fmtCr(salesTarget)}
                  </span>
                </div>
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, lineHeight: 1, textAlign: "right" }}>
                <div style={{ fontSize: 54, letterSpacing: "-.02em", color: pctColor }}>{salesPct.toFixed(1)}%</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: G.inkFaint, letterSpacing: ".04em", marginTop: 4 }}>achieved</div>
              </div>
            </div>

            {/* progress bar */}
            <div className="cd-shimmer" style={{ position: "relative", height: 18, borderRadius: 999, marginTop: 22, background: "#eef2f7", overflow: "hidden" }}>
              <div style={{
                position: "relative", zIndex: 1, height: "100%",
                width: `${salesPct}%`,
                borderRadius: 999,
                background: `linear-gradient(90deg,${G.green},#16b079)`,
                transition: "width 1.4s cubic-bezier(.22,1,.36,1)",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12.5, color: G.inkFaint, fontWeight: 600 }}>
              <span>₹0</span>
              <span>{fmtCr(salesTarget * 0.25)}</span>
              <span>{fmtCr(salesTarget * 0.5)}</span>
              <span>{fmtCr(salesTarget * 0.75)}</span>
              <span>{fmtCr(salesTarget)}</span>
            </div>
          </section>

          {/* pm surya ghar */}
          <section style={{
            position: "relative", background: "#fff", border: `1px solid ${G.line}`,
            borderRadius: 22, boxShadow: G.shadow, padding: "30px 34px", overflow: "hidden",
          }}>
            {/* blue left border */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: `linear-gradient(${G.blue},${G.blueDeep})` }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: G.blueDeep }}>
                  PM Surya Ghar Yojana
                </div>
                <div style={{ fontSize: 15, color: G.inkSoft, marginTop: 6, fontWeight: 500 }}>
                  Direct Solar Customers This Month
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 18 }}>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 40, fontWeight: 700, color: G.ink, letterSpacing: "-.01em" }}>
                    {solarAchieved}
                  </span>
                  <span style={{ fontSize: 19, color: G.inkSoft, fontWeight: 600 }}>/ {solarTarget} customers</span>
                </div>
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, lineHeight: 1, textAlign: "right" }}>
                <div style={{ fontSize: 54, letterSpacing: "-.02em", color: G.blueDeep }}>{solarPct.toFixed(0)}%</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: G.inkFaint, letterSpacing: ".04em", marginTop: 4 }}>of target</div>
              </div>
            </div>

            {/* customer dots */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 11, marginTop: 24 }}>
              {Array.from({ length: solarTarget }).map((_, i) => (
                <div key={i} style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: i < solarAchieved ? `linear-gradient(135deg,${G.blue},${G.blueDeep})` : "#eef2f7",
                  border: `1px solid ${i < solarAchieved ? "transparent" : "#e2e8f1"}`,
                  boxShadow: i < solarAchieved ? `0 4px 10px -3px rgba(23,105,192,.55)` : "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }} />
              ))}
            </div>

            <div style={{ textAlign: "right", fontSize: 13.5, color: G.inkSoft, marginTop: 18, fontWeight: 600 }}>
              {solarRemain > 0
                ? <><b style={{ color: G.blueDeep }}>{solarRemain} more</b> customer{solarRemain !== 1 ? "s" : ""} needed</>
                : <b style={{ color: G.green }}>Target reached 🎉</b>}
            </div>
          </section>

        </main>

        {/* ── footer ── */}
        <footer style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 48px", fontSize: 13, color: G.inkFaint,
          borderTop: `1px solid ${G.line}`,
          background: "rgba(255,255,255,.55)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <b style={{ color: G.inkSoft, fontWeight: 700 }}>Hussain Enterprise</b> · Countdown Display
          </div>
          <div>Auto-refreshes every 5 min</div>
        </footer>

      </div>
    </>
  );
}
