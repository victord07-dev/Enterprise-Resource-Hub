import { useState, useEffect } from "react";
import QRCode from "qrcode";
import type { Employee } from "@shared/schema";
import logoUrl from "@assets/HE-LOGO.jpeg";
import stampUrl from "@assets/company-stamp.png";

const GREEN      = "#038803";
const GREEN_DEEP = "#024d02";
const ORANGE     = "#f26a1b";
const NAVY       = "#15217a";
const INK        = "#1b1d23";
const MUTED      = "#6b7280";
const LINE       = "#e7e8ec";

const CARD_W = 340;
const CARD_H = 540;

// Header height and photo overlap constants
const HEADER_H   = 150;
const PHOTO_D    = 118;  // diameter
const PHOTO_OVERLAP = 52; // how much the photo overlaps up into the header
// photo-wrap top (absolute) = HEADER_H - PHOTO_OVERLAP = 98
const PHOTO_TOP  = HEADER_H - PHOTO_OVERLAP; // 98px
// spacer below header so name starts right below photo (gap 13px)
// photo bottom = PHOTO_TOP + PHOTO_D = 216; header bottom = 150; extra = 66px + 13px gap = 79px
const AFTER_HEADER_SPACER = (PHOTO_TOP + PHOTO_D - HEADER_H) + 13; // 79px

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}
function empCode(emp: Employee) {
  return (emp.qrCode ? emp.qrCode.replace("NEXERP-EMP-", "") : emp.id)
    .slice(0, 8).toUpperCase();
}
function issuedDate(emp: Employee) {
  if (!emp.joinDate) return "—";
  return new Date(emp.joinDate)
    .toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    .toUpperCase();
}
function normaliseQrSvg(svg: string) {
  return svg
    .replace(/(<svg[^>]*)\swidth="[^"]*"/, '$1 width="100%"')
    .replace(/(<svg[^>]*)\sheight="[^"]*"/, '$1 height="100%"');
}

interface Props {
  employee: Employee;
  /** When set, renders only that face flat (no 3D) for html2canvas capture */
  captureFace?: "front" | "back";
}

export function FrontFace({ employee, qrPng }: { employee: Employee; qrPng: string | null }) {
  const code  = empCode(employee);
  const blood = (employee as any).bloodGroup as string | null | undefined;
  const photo = (employee as any).photoUrl  as string | null | undefined;

  return (
    <div
      data-face="front"
      style={{
        width: CARD_W, height: CARD_H, borderRadius: 20, overflow: "hidden",
        background: "#fff",
        boxShadow: "0 18px 50px -20px rgba(11,66,29,.55), 0 2px 6px rgba(0,0,0,.06)",
        position: "relative",
      }}
    >
      {/* Header — diagonal clip */}
      <div style={{
        position: "relative",
        height: HEADER_H,
        background: `radial-gradient(120% 120% at 85% -10%, rgba(242,106,27,.35), transparent 55%),
                     linear-gradient(160deg, ${GREEN} 0%, ${GREEN_DEEP} 100%)`,
        color: "#fff",
        padding: "30px 22px 0",
        clipPath: "polygon(0 0, 100% 0, 100% 78%, 0 100%)",
      }}>
        {/* Lanyard hole */}
        <div style={{
          position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
          width: 46, height: 11, borderRadius: 6,
          background: "rgba(255,255,255,.35)", border: "1.5px solid rgba(255,255,255,.65)",
          zIndex: 5,
        }} />
        {/* Ribbon */}
        <div style={{
          position: "absolute", top: 18, right: 0,
          background: ORANGE, color: "#fff",
          fontSize: 9, fontWeight: 700, letterSpacing: "1.6px",
          padding: "5px 14px 5px 16px", textTransform: "uppercase",
          clipPath: "polygon(12px 0, 100% 0, 100% 100%, 0 100%)",
        }}>Employee ID</div>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 6 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 11, background: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(0,0,0,.25)", flexShrink: 0, padding: 5,
          }}>
            <img src={logoUrl} alt="HE" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 21, lineHeight: 1, letterSpacing: 0.3, textTransform: "uppercase", whiteSpace: "nowrap" }}>
              Hussain Enterprise
            </div>
            <div style={{ fontSize: 9, letterSpacing: "2.4px", opacity: 0.9, textTransform: "uppercase", marginTop: 4, whiteSpace: "nowrap" }}>
              Bright The World
            </div>
          </div>
        </div>
      </div>

      {/* Photo — absolutely positioned so it overlaps the header correctly in both DOM and html2canvas */}
      <div style={{
        position: "absolute",
        top: PHOTO_TOP,
        left: "50%",
        transform: "translateX(-50%)",
        width: PHOTO_D, height: PHOTO_D,
        zIndex: 4,
      }}>
        {/* Dashed ring */}
        <div style={{
          position: "absolute", inset: -6, borderRadius: "50%",
          border: "1.5px dashed rgba(26,125,58,.45)",
        }} />
        {/* Photo circle */}
        <div style={{
          width: PHOTO_D, height: PHOTO_D, borderRadius: "50%",
          border: "4px solid #fff",
          background: photo ? "transparent" : `linear-gradient(150deg, ${NAVY}, #0c1547)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 700, fontSize: 42, letterSpacing: 1,
          boxShadow: "0 10px 24px -8px rgba(12,21,71,.6)",
          overflow: "hidden", textAlign: "center",
        }}>
          {photo
            ? <img src={photo} alt={employee.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initials(employee.name)
          }
        </div>
      </div>

      {/* Spacer: pushes content below the photo (absolute-positioned photo is out of flow) */}
      <div style={{ height: AFTER_HEADER_SPACER }} />

      {/* Name */}
      <div style={{
        textAlign: "center",
        fontWeight: 700, fontSize: 27, lineHeight: 1, letterSpacing: 0.2,
        color: INK, padding: "0 12px",
      }}>{employee.name}</div>

      {/* Role */}
      <div style={{
        textAlign: "center", marginTop: 4,
        fontSize: 12, fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase",
        color: GREEN,
      }}>
        {employee.designation}
        {employee.department && (
          <span style={{ color: MUTED, fontWeight: 500 }}> · {employee.department}</span>
        )}
      </div>

      {/* Meta grid */}
      <div style={{
        margin: "12px 22px 0",
        borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`,
        padding: "10px 0",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 8.5, letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>Employee ID</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>#{code}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 8.5, letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>Blood Group</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>{blood || "—"}</span>
        </div>
        <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 8.5, letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>Phone</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{employee.phone || "—"}</span>
        </div>
        <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 8.5, letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>Email</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: INK, letterSpacing: 0 }}>{employee.email || "—"}</span>
        </div>
      </div>

      {/* Stamp */}
      <div style={{
        position: "absolute", right: 14, bottom: 40, width: 126,
        zIndex: 3, textAlign: "center", pointerEvents: "none",
      }}>
        <img
          src={stampUrl}
          alt="Authorised Signature"
          style={{ width: "100%", height: "auto", display: "block", transform: "rotate(-2.5deg)" }}
        />
        <div style={{ fontSize: 7, letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED, fontWeight: 700 }}>
          Authorised Signature
        </div>
      </div>

      {/* Stripe */}
      <div style={{ position: "absolute", bottom: 30, left: 0, right: 0, height: 5, display: "flex" }}>
        {[GREEN, ORANGE, NAVY, "#1f8f2e"].map((c, i) => (
          <span key={i} style={{ flex: 1, background: c }} />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: 30, display: "flex", alignItems: "center",
        padding: "0 22px", justifyContent: "space-between",
        fontSize: 9, letterSpacing: "0.5px", color: MUTED,
      }}>
        <span>ISSUED · {issuedDate(employee)}</span>
        <span>HE ERP SYSTEM</span>
      </div>
    </div>
  );
}

export function BackFace({ employee, qrSvg, qrPng, usePngQr }: {
  employee: Employee;
  qrSvg: string | null;
  qrPng: string | null;
  usePngQr?: boolean;
}) {
  const address = (employee as any).address as string | null | undefined;

  return (
    <div
      data-face="back"
      style={{
        width: CARD_W, height: CARD_H, borderRadius: 20, overflow: "hidden",
        background: `radial-gradient(110% 80% at 50% 0%, rgba(26,125,58,.09), transparent 60%),
                     linear-gradient(180deg, #fbfbfd 0%, #f3f4f7 100%)`,
        display: "flex", flexDirection: "column",
        boxShadow: "0 18px 50px -20px rgba(11,66,29,.55), 0 2px 6px rgba(0,0,0,.06)",
        padding: "26px 22px 0",
        position: "relative",
      }}
    >
      {/* Back header */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, justifyContent: "center", flexShrink: 0 }}>
        <img src={logoUrl} alt="HE" style={{ height: 30, width: "auto", objectFit: "contain" }} />
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "0.4px", textTransform: "uppercase", color: GREEN }}>
          Hussain Enterprise
        </span>
      </div>

      {/* QR box */}
      <div style={{
        margin: "14px auto 0", width: 210, height: 210, flexShrink: 0,
        background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16,
        padding: 14, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 10px 26px -14px rgba(0,0,0,.45)", overflow: "hidden",
      }}>
        {usePngQr && qrPng
          ? <img src={qrPng} alt="QR" style={{ width: "100%", height: "100%" }} />
          : qrSvg
            ? <div dangerouslySetInnerHTML={{ __html: qrSvg }} style={{ width: "100%", height: "100%" }} />
            : <span style={{ fontSize: 12, color: MUTED }}>No QR</span>
        }
      </div>

      {/* QR caption */}
      <div style={{
        textAlign: "center", fontSize: 9, letterSpacing: "2.5px",
        textTransform: "uppercase", color: MUTED, marginTop: 8, fontWeight: 600, flexShrink: 0,
      }}>Scan to verify identity</div>

      {/* Info rows */}
      <div style={{
        marginTop: 14, display: "flex", flexDirection: "column",
        background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12,
        overflow: "hidden", flexShrink: 0,
      }}>
        {[
          ["Name",        employee.name],
          ["Designation", `${employee.designation} — ${employee.department}`],
          ["Address",     address || "—"],
          ["Phone",       employee.phone || "—"],
        ].map(([k, v], i, arr) => (
          <div key={k} style={{
            display: "flex", gap: 10, padding: "8px 13px",
            borderBottom: i < arr.length - 1 ? `1px solid ${LINE}` : "none",
            alignItems: "baseline",
          }}>
            <span style={{ flex: "0 0 78px", fontSize: 8.5, letterSpacing: "1px", textTransform: "uppercase", color: MUTED, fontWeight: 700, paddingTop: 1 }}>{k}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: INK, lineHeight: 1.35 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: "auto",
        marginLeft: -22, marginRight: -22,
        background: `linear-gradient(160deg, ${GREEN}, ${GREEN_DEEP})`,
        color: "#fff", padding: "10px 22px 12px", textAlign: "center",
        borderRadius: "20px 20px 0 0", flexShrink: 0,
      }}>
        <div style={{ fontSize: 8.5, lineHeight: 1.4, opacity: 0.9 }}>
          If found, please return to Hussain Enterprise.<br />This card remains property of the company.
        </div>
        <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: "3px", textTransform: "uppercase", marginTop: 4 }}>
          Bright The World
        </div>
      </div>
    </div>
  );
}

export default function EmployeeIdCard({ employee, captureFace }: Props) {
  const [flipped, setFlipped] = useState(false);
  const [qrSvg,  setQrSvg]   = useState<string | null>(null);
  const [qrPng,  setQrPng]   = useState<string | null>(null);

  useEffect(() => {
    const src = employee.qrCode || `HE-EMP-${empCode(employee)}`;
    QRCode.toString(src, { type: "svg", width: 182, margin: 1, color: { dark: "#000", light: "#fff" } })
      .then((s) => setQrSvg(normaliseQrSvg(s)))
      .catch(() => setQrSvg(null));
    QRCode.toDataURL(src, { width: 364, margin: 1, color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => setQrPng(url))
      .catch(() => setQrPng(null));
  }, [employee.qrCode, employee.id]);

  /* ── Single-face capture mode (for html2canvas in PDF generation) ─────── */
  if (captureFace === "front") {
    return <FrontFace employee={employee} qrPng={qrPng} />;
  }
  if (captureFace === "back") {
    return <BackFace employee={employee} qrSvg={qrSvg} qrPng={qrPng} usePngQr />;
  }

  /* ── Interactive flip card ──────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, userSelect: "none" }}>

      <div
        style={{ width: CARD_W, height: CARD_H, perspective: 1600 }}
        onClick={() => setFlipped(f => !f)}
      >
        <div style={{
          position: "relative", width: "100%", height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.7s cubic-bezier(.4,.05,.2,1)",
          transform: flipped ? "rotateY(180deg)" : "none",
          cursor: "pointer",
        }}>
          {/* FRONT */}
          <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}>
            <FrontFace employee={employee} qrPng={qrPng} />
          </div>

          {/* BACK */}
          <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <BackFace employee={employee} qrSvg={qrSvg} qrPng={qrPng} />
          </div>
        </div>
      </div>

      {/* Flip button */}
      <button
        type="button"
        onClick={() => setFlipped(f => !f)}
        style={{
          width: CARD_W, border: `1px solid ${LINE}`, background: "#fff", color: GREEN,
          fontWeight: 600, fontSize: 13, letterSpacing: "0.3px",
          padding: 11, borderRadius: 11, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          transition: "background .15s, border-color .15s",
        }}
        onMouseEnter={e => { (e.currentTarget as any).style.background = "#f1faf3"; (e.currentTarget as any).style.borderColor = "#cbe9d3"; }}
        onMouseLeave={e => { (e.currentTarget as any).style.background = "#fff"; (e.currentTarget as any).style.borderColor = LINE; }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/>
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>
        </svg>
        {flipped ? "View front of card" : "View back of card"}
      </button>
    </div>
  );
}
