// Shared IST (Asia/Kolkata, UTC+5:30) date helpers used by both client and server.
// All "today/date defaults/range presets" in the operational expense module flow
// through these helpers so dates are always interpreted in India Standard Time
// regardless of the host's local timezone.

const IST_TZ = "Asia/Kolkata";

// Returns YYYY-MM-DD for the given Date in IST.
export function toISTDateString(d: Date = new Date()): string {
  // en-CA locale formats as YYYY-MM-DD which matches the date-input wire format.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Returns YYYY-MM-DD for "today" in IST.
export function todayIST(): string {
  return toISTDateString(new Date());
}

// Returns YYYY-MM-DD for `n` days ago, evaluated in IST (i.e. subtracting calendar days).
export function daysAgoIST(n: number): string {
  const today = todayIST();
  const [y, m, d] = today.split("-").map(Number);
  // Build a UTC Date at the IST-day boundary, subtract days, re-format in IST.
  // Using UTC midnight here avoids DST drift; IST itself has no DST.
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - n);
  return toISTDateString(utc);
}

// First day of the current calendar month in IST (YYYY-MM-01).
export function startOfMonthIST(): string {
  const today = todayIST();
  return `${today.slice(0, 7)}-01`;
}

// First day of the current calendar year in IST (YYYY-01-01).
export function startOfYearIST(): string {
  return `${todayIST().slice(0, 4)}-01-01`;
}
