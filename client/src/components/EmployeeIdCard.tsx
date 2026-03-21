import type { Employee } from "@shared/schema";

interface EmployeeIdCardProps {
  employee: Employee;
  qrDataUrl: string | null;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function EmployeeIdCard({ employee, qrDataUrl }: EmployeeIdCardProps) {
  const empCode = employee.qrCode
    ? employee.qrCode.replace("NEXERP-EMP-", "").slice(0, 8).toUpperCase()
    : employee.id.slice(0, 8).toUpperCase();

  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-xl select-none"
      style={{ width: 320, height: 200, background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)" }}
      data-testid="employee-id-card"
    >
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.08) 8px, rgba(255,255,255,0.08) 16px)",
        }}
      />

      <div
        className="absolute top-0 left-0 right-0 px-5 py-2.5 flex items-center justify-between"
        style={{ background: "rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.12)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded flex items-center justify-center text-white font-black text-xs"
            style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}
          >
            I
          </div>
          <span className="text-white font-bold text-sm tracking-wide">ITFI Group</span>
        </div>
        <span className="text-xs font-medium tracking-widest" style={{ color: "#93c5fd" }}>
          EMPLOYEE ID
        </span>
      </div>

      <div className="absolute inset-0 flex items-center px-5 pt-6">
        <div className="flex items-center gap-4 w-full">
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl border-2"
              style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", borderColor: "rgba(147,197,253,0.4)" }}
              data-testid="id-card-avatar"
            >
              {getInitials(employee.name)}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-base leading-tight truncate" data-testid="id-card-name">
              {employee.name}
            </p>
            <p className="text-xs mt-0.5 truncate font-medium" style={{ color: "#93c5fd" }} data-testid="id-card-designation">
              {employee.designation}
            </p>
            <p className="text-xs truncate mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }} data-testid="id-card-department">
              {employee.department}
              {employee.company ? ` · ${employee.company}` : ""}
            </p>

            <div className="mt-2.5 flex items-center gap-2">
              <div
                className="px-2 py-0.5 rounded text-xs font-mono font-semibold"
                style={{ background: "rgba(59,130,246,0.25)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)" }}
                data-testid="id-card-code"
              >
                #{empCode}
              </div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                {employee.joinDate
                  ? `Since ${new Date(employee.joinDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`
                  : ""}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 shrink-0">
            {qrDataUrl ? (
              <div
                className="p-1.5 rounded-lg"
                style={{ background: "white", width: 68, height: 68 }}
              >
                <img
                  src={qrDataUrl}
                  alt="Attendance QR"
                  className="w-full h-full object-contain"
                  data-testid="id-card-qr"
                />
              </div>
            ) : (
              <div
                className="rounded-lg flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.08)", width: 68, height: 68, border: "1px dashed rgba(255,255,255,0.25)" }}
              >
                <span className="text-xs text-center" style={{ color: "rgba(255,255,255,0.4)", lineHeight: 1.2, padding: "0 4px" }}>
                  No QR
                </span>
              </div>
            )}
            <span className="text-center font-medium" style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em" }}>
              SCAN TO CHECK IN
            </span>
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 px-5 py-1.5 flex items-center justify-between"
        style={{ background: "rgba(0,0,0,0.25)", borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>
          {employee.phone || employee.email || ""}
        </span>
        <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>
          ITFI ERP System
        </span>
      </div>
    </div>
  );
}
