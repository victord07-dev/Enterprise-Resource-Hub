import type { Request, Response, NextFunction } from "express";

const SLOW_THRESHOLD_MS = 300;

export function slowRequestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api")) return next();
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      if (duration < SLOW_THRESHOLD_MS) return;
      const role = (req as any).user?.role ?? "anon";
      const userId = (req as any).user?.id ?? "-";
      const time = new Date().toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
      });
      console.warn(
        `${time} [slow] ${req.method} ${req.path} ${res.statusCode} in ${duration}ms (role=${role} user=${userId})`,
      );
    });
    next();
  };
}
