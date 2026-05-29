import type { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { URL } from "url";

const JWT_SECRET = process.env.SESSION_SECRET || "nexerp-dev-only-secret-do-not-use-in-prod";
const WHATSAPP_ROLES = new Set(["admin", "sales_manager", "field_staff"]);

export type WhatsappEvent =
  | { type: "message"; conversationId: string; message: any; conversation?: any }
  | { type: "status"; conversationId?: string; messageId: string; interaktMessageId: string; status: string }
  | { type: "conversation"; conversation: any };

interface AuthedSocket extends WebSocket {
  userId?: string;
  role?: string;
  isAlive?: boolean;
}

let wss: WebSocketServer | null = null;

export function setupWhatsappWebSocket(httpServer: HttpServer) {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (url.pathname !== "/ws/whatsapp") return;

      const token = url.searchParams.get("token");
      if (!token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      jwt.verify(token, JWT_SECRET, (err: any, payload: any) => {
        if (err || !payload || !WHATSAPP_ROLES.has(payload.role)) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
        wss!.handleUpgrade(req, socket, head, (ws) => {
          const aws = ws as AuthedSocket;
          aws.userId = payload.id;
          aws.role = payload.role;
          aws.isAlive = true;
          wss!.emit("connection", aws, req);
        });
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", (ws: AuthedSocket) => {
    ws.on("pong", () => { ws.isAlive = true; });
    ws.on("message", () => { /* ignore client → server messages for now */ });
  });

  // Heartbeat: drop dead clients every 30s
  setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((client) => {
      const ws = client as AuthedSocket;
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    });
  }, 30000);
}

export function broadcastWhatsappEvent(event: WhatsappEvent) {
  if (!wss) return;
  const payload = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(payload); } catch { /* ignore send failures */ }
    }
  });
}
