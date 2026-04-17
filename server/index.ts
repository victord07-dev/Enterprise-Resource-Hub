import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cron from "node-cron";
import { storage } from "./storage";
import { sendTemplateMessage, syncInteraktTemplates } from "./whatsapp";
import { setupWhatsappWebSocket } from "./wsHub";

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
