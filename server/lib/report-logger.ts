/**
 * Phase 4C — Dual-write report generation logger.
 *
 * On every financial report download, writes a row to BOTH:
 *   - report_generation_log: compliance-grade structured record
 *   - audit_logs: general action trail (action='report_generated', module='reports')
 *
 * Resolves N16 ambiguity: same event, two destinations.
 */

import { storage } from "../storage";

export interface LogReportArgs {
  reportType: string;          // e.g. 'pl_statement', 'sales_register'
  generatedBy: string;         // userId
  format: "pdf" | "excel" | "json";
  filters?: Record<string, unknown>;
  fileSizeBytes?: number;
}

/**
 * Log a report generation event. Failures are swallowed (audit logging
 * must never break a download), but written to console.
 */
export async function logReportGeneration(args: LogReportArgs): Promise<void> {
  const { reportType, generatedBy, format, filters, fileSizeBytes } = args;
  try {
    await storage.createReportGenerationLog({
      reportType,
      generatedBy,
      format,
      filters: filters ?? null,
      fileSizeBytes: fileSizeBytes ?? null,
    } as any);
  } catch (e) {
    console.error("[report-logger] report_generation_log write failed:", e);
  }
  try {
    await storage.createAuditLog({
      userId: generatedBy,
      action: "report_generated",
      module: "reports",
      details: JSON.stringify({ reportType, format, filters: filters ?? null }),
    });
  } catch (e) {
    console.error("[report-logger] audit_logs write failed:", e);
  }
}
