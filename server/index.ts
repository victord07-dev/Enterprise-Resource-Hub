import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cron from "node-cron";
import { storage } from "./storage";
import { sendTemplateMessage, syncInteraktTemplates, pruneOldTemplateSyncLogs, TEMPLATE_SYNC_LOG_RETENTION_DAYS, getWebhookUrl } from "./whatsapp";
import { setupWhatsappWebSocket } from "./wsHub";
import { processWhatsappWebhookJob, nextRunAtForAttempt, MAX_ATTEMPTS } from "./whatsappProcessor";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(cors({
  origin: [
    "capacitor://localhost",
    "https://localhost",
    "http://localhost",
    "https://erp.itfi.co.in",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  setupWhatsappWebSocket(httpServer);

  // ── One-time backfill: ensure every existing WhatsApp template has at
  // least one status-history entry so the history dialog is never blank.
  try {
    const inserted = await storage.backfillWhatsappTemplateStatusHistory();
    if (inserted > 0) {
      console.log(`[WA TEMPLATE BACKFILL] Inserted ${inserted} initial status history row(s) for existing templates`);
    }
  } catch (err) {
    console.error("[WA TEMPLATE BACKFILL] Failed to backfill template status history:", err);
  }

  // ── WhatsApp CRON Alerts ───────────────────────────────────────────────────
  async function sendOwnerDailyAlert() {
    try {
      const templateName = "owner_daily_alert";
      // Overdue AR: sales invoices with status pending/partial_paid and dueDate < today
      const allArInvoices = await storage.getSalesInvoices();
      const now = new Date();
      const overdueArCount = allArInvoices.filter((inv: any) => {
        if (inv.status === "paid") return false;
        if (!inv.dueDate) return false;
        return new Date(inv.dueDate) < now;
      }).length;

      // AP: supplier invoices still pending payment
      const allApInvoices = await storage.getSupplierInvoices();
      const supplierDue = allApInvoices.filter((inv: any) => inv.status === "pending").length;

      // Payroll: employees not yet paid this month
      const allPayroll = await storage.getPayrollStatuses();
      const salaryPending = allPayroll.filter((p: any) => p.status === "pending").length;

      const adminUsers = await storage.getUsers();
      const admins = adminUsers.filter((u: any) => u.role === "admin");
      if (admins.length === 0) {
        console.warn("[WA CRON] No admin users found — skipping owner_daily_alert");
        return;
      }

      for (const user of admins) {
        const emp = user.employeeId
          ? (await storage.getEmployee(user.employeeId))
          : null;
        const ownerName = emp?.name || user.fullName || user.username;
        const phone = emp?.phone;
        if (!phone) {
          console.warn(`[WA CRON] Admin user ${user.username} has no phone number — skipping daily alert`);
          continue;
        }
        try {
          await sendTemplateMessage(phone, templateName, [
            ownerName,
            String(overdueArCount),
            String(supplierDue),
            String(salaryPending),
          ]);
          console.log(`[WA CRON] Sent owner_daily_alert to ${user.username} (${phone})`);
        } catch (sendErr) {
          console.warn(`[WA CRON] Failed to send alert to ${user.username} (${phone}):`, sendErr);
        }
      }
    } catch (err) {
      console.error("[WA CRON] owner_daily_alert error:", err);
    }
  }

  cron.schedule("0 9 * * *", sendOwnerDailyAlert, { timezone: "Asia/Kolkata" });
  cron.schedule("0 18 * * *", sendOwnerDailyAlert, { timezone: "Asia/Kolkata" });

  // ── Daily Interakt template sync ───────────────────────────────────────────
  // Track the failure streak so admins aren't spammed when the same error
  // recurs day after day. We only send a new alert when the error message
  // changes (or after a successful sync resets the streak).
  let lastNotifiedSyncFailure: string | null = null;

  async function runDailyTemplateSync() {
    if (!process.env.INTERAKT_API_KEY) {
      console.warn("[WA TEMPLATE SYNC] INTERAKT_API_KEY not set — skipping scheduled sync");
      return;
    }
    try {
      const result = await syncInteraktTemplates(storage, "scheduled");
      console.log(`[WA TEMPLATE SYNC] Daily sync complete: ${result.total} fetched, ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.statusChanges.length} status changes`);
      if (result.statusChanges.length > 0) {
        await notifyAdminsOfTemplateStatusChanges(result.statusChanges);
      }
      lastNotifiedSyncFailure = null;
    } catch (err: any) {
      console.error("[WA TEMPLATE SYNC] Daily sync failed:", err);
      const errorMessage = (err?.message || String(err) || "Unknown error").slice(0, 500);
      if (errorMessage !== lastNotifiedSyncFailure) {
        try {
          const notified = await notifyAdminsOfSyncFailure(errorMessage);
          // Only treat the streak as "alerted" if at least one admin
          // notification was actually persisted — otherwise we'd silence
          // future alerts despite never having delivered one.
          if (notified > 0) {
            lastNotifiedSyncFailure = errorMessage;
          }
        } catch (notifErr) {
          console.error("[WA TEMPLATE SYNC] Failed to send failure alert:", notifErr);
        }
      } else {
        console.log("[WA TEMPLATE SYNC] Suppressing duplicate failure alert for repeated error");
      }
    }
  }

  async function notifyAdminsOfSyncFailure(errorMessage: string): Promise<number> {
    const allUsers = await storage.getUsers();
    const admins = allUsers.filter((u: any) => u.role === "admin" && u.isActive);
    if (admins.length === 0) {
      console.warn("[WA TEMPLATE SYNC] No active admin users — skipping failure notification");
      return 0;
    }
    const title = "WhatsApp template sync failed";
    const message = `The scheduled daily Interakt template sync failed: ${errorMessage}`;
    let notified = 0;
    for (const u of admins) {
      try {
        await storage.createNotification({
          userId: u.id,
          type: "whatsapp_template",
          title,
          message,
          relatedId: null,
        });
        notified++;
      } catch (notifErr) {
        console.warn(`[WA TEMPLATE SYNC] Failed to notify admin ${u.username} of failure:`, notifErr);
      }
    }
    console.log(`[WA TEMPLATE SYNC] Notified ${notified}/${admins.length} admin(s) of sync failure`);
    return notified;
  }

  function formatStatusLabel(s: string): string {
    if (s === "approved") return "APPROVED";
    if (s === "rejected") return "REJECTED";
    if (s === "pending_approval") return "PENDING";
    return (s || "UNKNOWN").toUpperCase();
  }

  async function notifyAdminsOfTemplateStatusChanges(
    changes: Array<{ templateId: string; name: string; languageCode: string; previousStatus: string; newStatus: string }>,
  ) {
    try {
      const allUsers = await storage.getUsers();
      const admins = allUsers.filter((u: any) => u.role === "admin" && u.isActive);
      if (admins.length === 0) {
        console.warn("[WA TEMPLATE SYNC] No active admin users — skipping status-change notifications");
        return;
      }

      const lines = changes.map(
        c => `${c.name} (${c.languageCode}): ${formatStatusLabel(c.previousStatus)} → ${formatStatusLabel(c.newStatus)}`,
      );
      const summary = lines.join("; ");
      const title = changes.length === 1
        ? `WhatsApp template status changed: ${changes[0].name}`
        : `${changes.length} WhatsApp templates changed status`;
      const message = `Daily Interakt sync detected: ${summary}`;

      for (const u of admins) {
        try {
          await storage.createNotification({
            userId: u.id,
            type: "whatsapp_template",
            title,
            message,
            relatedId: changes[0].templateId,
          });
        } catch (notifErr) {
          console.warn(`[WA TEMPLATE SYNC] Failed to notify admin ${u.username}:`, notifErr);
        }
      }
      console.log(`[WA TEMPLATE SYNC] Notified ${admins.length} admin(s) of ${changes.length} status change(s)`);
    } catch (err) {
      console.error("[WA TEMPLATE SYNC] notifyAdminsOfTemplateStatusChanges error:", err);
    }
  }

  cron.schedule("30 3 * * *", runDailyTemplateSync, { timezone: "Asia/Kolkata" });

  // ── Daily prune of old WhatsApp template sync logs ─────────────────────────
  // Keeps the `whatsapp_template_sync_logs` table small by deleting rows
  // older than TEMPLATE_SYNC_LOG_RETENTION_DAYS (currently 90 days).
  // Inline pruning also runs after every sync; this cron guarantees pruning
  // even if syncs stop happening.
  async function runWhatsappSyncLogCleanup() {
    try {
      const removed = await pruneOldTemplateSyncLogs(storage);
      if (removed > 0) {
        console.log(`[WA TEMPLATE SYNC] Pruned ${removed} sync log row(s) older than ${TEMPLATE_SYNC_LOG_RETENTION_DAYS} days`);
      }
    } catch (err) {
      console.error("[WA TEMPLATE SYNC] Sync log cleanup failed:", err);
    }
  }
  cron.schedule("0 4 * * *", runWhatsappSyncLogCleanup, { timezone: "Asia/Kolkata" });
  // Also run once shortly after startup so a long-stopped instance prunes quickly.
  setTimeout(runWhatsappSyncLogCleanup, 30_000).unref();

  // ── Daily prune of old debug payload captures (Task #67 Phase 2 task 10a) ──
  // Captures auto-expire after 30 days so debug data doesn't accumulate.
  async function runDebugCaptureCleanup() {
    try {
      const removed = await storage.pruneOldDebugPayloadCaptures(30);
      if (removed > 0) {
        console.log(`[WA DEBUG CAPTURE] Pruned ${removed} capture row(s) older than 30 days`);
      }
    } catch (err) {
      console.error("[WA DEBUG CAPTURE] Cleanup failed:", err);
    }
  }
  cron.schedule("15 4 * * *", runDebugCaptureCleanup, { timezone: "Asia/Kolkata" });
  setTimeout(runDebugCaptureCleanup, 45_000).unref();

  // ── Phase 7 B5: Bundle auto-price drift check (02:00 IST nightly) ──────────
  // For every active product where type='bundle' and pricingMode='auto',
  // recompute the live auto price (Σ component effective × qty for today).
  // If the drift versus the stored sellingPrice exceeds AUTO_DRIFT_THRESHOLD,
  // mark the bundle as needsPricingReview and write an audit row so a human
  // approves the new number. We never auto-update sellingPrice — drift is a
  // signal for review, not a silent change.
  const AUTO_DRIFT_THRESHOLD = 0.05; // 5 %
  async function runBundleAutoPriceDriftCheck() {
    try {
      const allProducts = await storage.getProducts();
      const autoBundles = allProducts.filter(
        (p: any) => p.type === "bundle" && p.pricingMode === "auto" && p.lifecycleStatus === "active",
      );
      if (autoBundles.length === 0) {
        console.log("[BUNDLE DRIFT] No auto-priced bundles — skipping");
        return;
      }
      // IST date string YYYY-MM-DD for the effective-price lookup.
      const istNow = new Date(Date.now() + 5.5 * 3600_000);
      const today = istNow.toISOString().slice(0, 10);

      let flagged = 0;
      let skipped = 0;
      for (const bundle of autoBundles) {
        try {
          const result = await storage.computeBundleAutoPrice(bundle.id, today);
          const newPrice = Number(result.totalPrice);
          const stored = Number(bundle.sellingPrice ?? 0);
          if (!Number.isFinite(newPrice) || newPrice <= 0) {
            skipped++;
            console.warn(`[BUNDLE DRIFT] ${bundle.sku} (${bundle.name}) — auto price unavailable (component price missing); skipped`);
            continue;
          }
          if (stored <= 0) {
            // No baseline to drift against — flag for review so admin sets first price.
            await storage.updateProduct(bundle.id, { needsPricingReview: true } as any);
            await storage.createAuditLog({
              userId: "system",
              action: "bundle_drift_flag",
              module: "products",
              details: JSON.stringify({
                bundleId: bundle.id,
                sku: bundle.sku,
                name: bundle.name,
                reason: "no_baseline",
                computedPrice: newPrice.toFixed(2),
              }),
            });
            flagged++;
            continue;
          }
          const drift = Math.abs(newPrice - stored) / stored;
          if (drift > AUTO_DRIFT_THRESHOLD) {
            await storage.updateProduct(bundle.id, { needsPricingReview: true } as any);
            await storage.createAuditLog({
              userId: "system",
              action: "bundle_drift_flag",
              module: "products",
              details: JSON.stringify({
                bundleId: bundle.id,
                sku: bundle.sku,
                name: bundle.name,
                storedPrice: stored.toFixed(2),
                computedPrice: newPrice.toFixed(2),
                driftPct: (drift * 100).toFixed(2),
                threshold: (AUTO_DRIFT_THRESHOLD * 100).toFixed(2),
              }),
            });
            flagged++;
            console.log(`[BUNDLE DRIFT] ${bundle.sku} (${bundle.name}) drift ${(drift * 100).toFixed(2)}% — flagged (stored=${stored.toFixed(2)} computed=${newPrice.toFixed(2)})`);
          }
        } catch (perBundleErr) {
          skipped++;
          console.error(`[BUNDLE DRIFT] ${bundle.sku} (${bundle.name}) failed:`, perBundleErr);
        }
      }
      console.log(`[BUNDLE DRIFT] Complete — checked ${autoBundles.length}, flagged ${flagged}, skipped ${skipped}`);
    } catch (err) {
      console.error("[BUNDLE DRIFT] Cron failed:", err);
    }
  }
  cron.schedule("0 2 * * *", runBundleAutoPriceDriftCheck, { timezone: "Asia/Kolkata" });

  // ── Webhook Silence Detector (Task #67 Phase 4) ────────────────────────────
  // Hourly during business hours (09:00–19:00 IST), check the last received
  // webhook timestamp. If silent for >SILENCE_THRESHOLD_HOURS, create an
  // in-app notification for every active admin. Re-alert is suppressed for
  // SILENCE_REALERT_HOURS so admins are not spammed every hour while broken.
  // In-memory cooldown is fine — worst case a server restart triggers one
  // extra alert, which is acceptable for an outage signal.
  const SILENCE_THRESHOLD_HOURS = 6;
  const SILENCE_REALERT_HOURS = 6;
  let lastSilenceAlertAtMs = 0;

  async function checkWebhookSilenceAndAlert() {
    try {
      const stats = await storage.getWhatsappWebhookJobStats();
      const lastMs = stats.lastJobAt ? new Date(stats.lastJobAt).getTime() : 0;
      const ageHours = lastMs ? (Date.now() - lastMs) / 3_600_000 : Infinity;
      if (ageHours <= SILENCE_THRESHOLD_HOURS) return;

      const sinceLastAlertMs = Date.now() - lastSilenceAlertAtMs;
      if (sinceLastAlertMs < SILENCE_REALERT_HOURS * 3_600_000) return;

      const allUsers = await storage.getUsers();
      const admins = allUsers.filter((u: any) => u.role === "admin" && u.isActive);
      if (admins.length === 0) return;

      const ageLabel = Number.isFinite(ageHours) ? `${ageHours.toFixed(1)}h` : "ever";
      const title = "WhatsApp webhook silent";
      const message = `No WhatsApp webhook received in ${ageLabel} during business hours. Check Interakt webhook configuration and the Webhook Health card on the WhatsApp Templates page.`;
      for (const u of admins) {
        await storage.createNotification({
          userId: u.id,
          type: "whatsapp_webhook_silence",
          title,
          message,
          relatedId: null,
        });
      }
      lastSilenceAlertAtMs = Date.now();
      console.warn(`[WA SILENCE] Alert dispatched to ${admins.length} admin(s) — last webhook ${ageLabel} ago`);
    } catch (err) {
      console.error("[WA SILENCE] Detector failed:", err);
    }
  }
  // Hourly during business hours (top of hour, 09–19 IST). 9 firings per day.
  cron.schedule("0 9-19 * * *", checkWebhookSilenceAndAlert, { timezone: "Asia/Kolkata" });

  // ── WhatsApp Webhook Config Smoke Log (Task #67 Phase 2) ───────────────────
  // Surface every webhook-related config decision at boot so an operator can
  // diagnose misconfiguration from the logs alone. In prod, missing secret
  // is logged as ERROR (matches the fail-closed behaviour in the handler).
  {
    const cfg = getWebhookUrl();
    const secretOk = !!process.env.INTERAKT_WEBHOOK_SECRET;
    const tokenOk = !!process.env.WHATSAPP_WEBHOOK_TOKEN;
    const isProd = process.env.NODE_ENV === "production";
    console.log(`[WA] webhook URL: ${cfg.url}${cfg.configured ? "" : " (set WHATSAPP_WEBHOOK_BASE_URL to enable)"}`);
    if (secretOk) {
      console.log(`[WA] webhook signing secret OK`);
    } else if (isProd) {
      console.error(`[WA] webhook signing secret MISSING — production WILL REJECT all calls with 503 until INTERAKT_WEBHOOK_SECRET is set`);
    } else {
      console.warn(`[WA] webhook signing secret MISSING — handler will reject with 503 (dev mirrors prod posture)`);
    }
    if (!tokenOk) {
      console.warn(`[WA] WHATSAPP_WEBHOOK_TOKEN not set — token check will reject every webhook`);
    }
  }

  // ── WhatsApp Webhook Worker Loop (Task #67 Phase 1) ─────────────────────────
  // Polls the whatsapp_webhook_jobs queue every WORKER_POLL_MS. Pickup uses
  // SELECT ... FOR UPDATE SKIP LOCKED so multiple workers can run safely.
  // Stuck jobs (status=processing AND locked_at older than STUCK_THRESHOLD_MS)
  // are reclaimed automatically — defends against worker crashes.
  const WORKER_POLL_MS = 1500;
  const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  let workerRunning = true;
  async function runWhatsappWebhookWorker() {
    console.log(`[WA WORKER] Started — poll=${WORKER_POLL_MS}ms stuck-threshold=${STUCK_THRESHOLD_MS}ms maxAttempts=${MAX_ATTEMPTS}`);
    while (workerRunning) {
      try {
        const job = await storage.pickupWhatsappWebhookJob(STUCK_THRESHOLD_MS);
        if (!job) {
          await new Promise(r => setTimeout(r, WORKER_POLL_MS));
          continue;
        }
        const startedAt = Date.now();
        try {
          const result = await processWhatsappWebhookJob(job.jobType, job.payload);
          await storage.markWhatsappWebhookJobDone(job.id);
          const ms = Date.now() - startedAt;
          console.log(`[WA WORKER] job=${job.id} type=${job.jobType} kind=${result.kind} ok in ${ms}ms`);
        } catch (procErr: any) {
          const ms = Date.now() - startedAt;
          const errMsg = procErr?.message || String(procErr) || "unknown processor error";
          const attemptsBefore = job.attempts || 0;
          const nextRun = nextRunAtForAttempt(attemptsBefore);
          const outcome = await storage.markWhatsappWebhookJobFailed(job.id, errMsg, nextRun, MAX_ATTEMPTS);
          console.error(`[WA WORKER] job=${job.id} type=${job.jobType} FAILED in ${ms}ms (attempt ${attemptsBefore + 1}/${MAX_ATTEMPTS}) deadLetter=${outcome.deadLettered}: ${errMsg}`);
        }
      } catch (loopErr: any) {
        // Pickup or DB error — back off briefly so we don't hot-loop.
        console.error("[WA WORKER] Pickup error — sleeping 5s:", loopErr?.message || loopErr);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    console.log("[WA WORKER] Stopped");
  }
  // Fire and forget — worker runs forever.
  runWhatsappWebhookWorker().catch(err => {
    console.error("[WA WORKER] Fatal worker error — process will exit:", err);
    process.exit(1);
  });
  // Allow graceful shutdown so SIGTERM ends the loop cleanly during workflow restarts.
  const stopWorker = () => { workerRunning = false; };
  process.once("SIGTERM", stopWorker);
  process.once("SIGINT", stopWorker);

  // return JSON 404 for unmatched /api/* routes in both dev and production
  app.use("/api/{*path}", (_req: Request, res: Response) => {
    res.status(404).json({ message: "API endpoint not found" });
  });

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
