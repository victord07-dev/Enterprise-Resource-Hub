import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { loginSchema } from "@shared/schema";

const JWT_SECRET = process.env.SESSION_SECRET || "nexerp-secret-key-change-in-production";

function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Authentication required" });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token" });
    req.user = user;
    next();
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Seed admin user
  const existingAdmin = await storage.getUserByUsername("admin");
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    await storage.createUser({
      username: "admin",
      password: hashedPassword,
      fullName: "Admin User",
      email: "admin@nexerp.com",
      role: "admin",
      isActive: true,
    });
    console.log("Admin user seeded: admin / admin123");
  }

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid credentials" });
      }
      const { username, password } = parsed.data;
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      await storage.createAuditLog({
        userId: user.id,
        action: "login",
        module: "auth",
        details: `User ${user.username} logged in`,
      });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
    const user = await storage.getUser(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    });
  });

  // Dashboard
  app.get("/api/dashboard/stats", authenticateToken, async (_req, res) => {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  });

  // Customers
  app.get("/api/customers", authenticateToken, async (_req, res) => {
    const data = await storage.getCustomers();
    res.json(data);
  });

  // Suppliers
  app.get("/api/suppliers", authenticateToken, async (_req, res) => {
    const data = await storage.getSuppliers();
    res.json(data);
  });

  // Products
  app.get("/api/products", authenticateToken, async (_req, res) => {
    const data = await storage.getProducts();
    res.json(data);
  });

  // Warehouses
  app.get("/api/warehouses", authenticateToken, async (_req, res) => {
    const data = await storage.getWarehouses();
    res.json(data);
  });

  // Sales Orders
  app.get("/api/sales-orders", authenticateToken, async (_req, res) => {
    const data = await storage.getSalesOrders();
    res.json(data);
  });

  // Quotations
  app.get("/api/quotations", authenticateToken, async (_req, res) => {
    const data = await storage.getQuotations();
    res.json(data);
  });

  // Projects
  app.get("/api/projects", authenticateToken, async (_req, res) => {
    const data = await storage.getProjects();
    res.json(data);
  });

  // Purchase Orders
  app.get("/api/purchase-orders", authenticateToken, async (_req, res) => {
    const data = await storage.getPurchaseOrders();
    res.json(data);
  });

  // Invoices
  app.get("/api/invoices", authenticateToken, async (_req, res) => {
    const data = await storage.getInvoices();
    res.json(data);
  });

  // Payments
  app.get("/api/payments", authenticateToken, async (_req, res) => {
    const data = await storage.getPayments();
    res.json(data);
  });

  // Employees
  app.get("/api/employees", authenticateToken, async (_req, res) => {
    const data = await storage.getEmployees();
    res.json(data);
  });

  // Attendance
  app.get("/api/attendance", authenticateToken, async (_req, res) => {
    const data = await storage.getAttendance();
    res.json(data);
  });

  // Audit Logs
  app.get("/api/audit-logs", authenticateToken, async (_req, res) => {
    const data = await storage.getAuditLogs();
    res.json(data);
  });

  return httpServer;
}
