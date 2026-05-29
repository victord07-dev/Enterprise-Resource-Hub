/**
 * Leave policy entitlements per calendar year.
 * These are the maximum days an employee may take for each leave type.
 * "Paid" types: annual, sick, casual
 * "Unpaid" type: unpaid (LWP)
 */

export const LEAVE_ENTITLEMENTS: Record<string, number> = {
  annual: 18,
  sick: 12,
  casual: 6,
  unpaid: 365, // no hard cap — but kept here for completeness
};

export const PAID_LEAVE_TYPES = ["annual", "sick", "casual"] as const;

export type PaidLeaveType = (typeof PAID_LEAVE_TYPES)[number];

/**
 * Returns the number of calendar days in the inclusive [startDate, endDate] range.
 */
export function countLeaveDays(startDate: Date, endDate: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const start = new Date(startDate.toDateString());
  const end = new Date(endDate.toDateString());
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / msPerDay) + 1);
}

/**
 * Returns the entitlement cap for the given leave type.
 * Returns Infinity for unknown or unpaid types so they are never blocked by this check.
 */
export function getEntitlement(leaveType: string): number {
  const cap = LEAVE_ENTITLEMENTS[leaveType.toLowerCase()];
  if (cap === undefined) return Infinity;
  return cap;
}
