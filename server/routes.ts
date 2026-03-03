import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import {
  loginSchema, insertCustomerSchema, insertSupplierSchema, insertProductSchema,
  insertWarehouseSchema, insertSalesOrderSchema, insertSalesOrderItemSchema, insertQuotationSchema,
  insertQuotationItemSchema, insertProjectSchema, insertPurchaseOrderSchema, insertInvoiceSchema,
  insertPaymentSchema, insertEmployeeSchema, insertAttendanceSchema,
  insertFieldStaffActivitySchema, insertUserSchema, insertLeadSchema,
} from "@shared/schema";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

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

function requireRole(...roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied. Insufficient permissions." });
    }
    next();
  };
}

async function logAction(userId: string, action: string, module: string, details?: string) {
  try {
    await storage.createAuditLog({ userId, action, module, details });
  } catch (e) {
    console.error("Audit log error:", e);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Seed admin user and demo data
  const existingAdmin = await storage.getUserByUsername("admin");
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    const admin = await storage.createUser({
      username: "admin",
      password: hashedPassword,
      fullName: "Admin User",
      email: "admin@itfi.co.in",
      role: "admin",
      isActive: true,
    });
    console.log("Admin user seeded: admin / admin123");

    // Seed demo data
    try {
      const cust1 = await storage.createCustomer({ name: "Rajesh Solar Industries", email: "rajesh@solarind.com", phone: "+91-9876543210", address: "Plot 45, MIDC Andheri, Mumbai, Maharashtra 400093", gstNumber: "27AABCS1234D1ZP", contactPerson: "Rajesh Sharma" });
      const cust2 = await storage.createCustomer({ name: "GreenTech Power Solutions", email: "info@greentechpower.in", phone: "+91-9823456789", address: "Sector 18, Gurugram, Haryana 122015", gstNumber: "06AABCG5678E1ZQ", contactPerson: "Priya Gupta" });
      const cust3 = await storage.createCustomer({ name: "SunPeak Energy Pvt Ltd", email: "contact@sunpeak.co.in", phone: "+91-9834567890", address: "Anna Nagar, Chennai, Tamil Nadu 600040", gstNumber: "33AABCS9012F1ZR", contactPerson: "Suresh Kumar" });
      const cust4 = await storage.createCustomer({ name: "Bharat Electronics Hub", email: "sales@bharatelec.com", phone: "+91-9845678901", address: "Koregaon Park, Pune, Maharashtra 411001", gstNumber: "27AABCB3456G1ZS", contactPerson: "Amit Patel" });
      const cust5 = await storage.createCustomer({ name: "Vishwa Commodities Trading", email: "info@vishwacomm.in", phone: "+91-9856789012", address: "Ellis Bridge, Ahmedabad, Gujarat 380006", gstNumber: "24AABCV7890H1ZT", contactPerson: "Deepak Mehta" });

      const sup1 = await storage.createSupplier({ name: "Trina Solar Ltd", email: "orders@trinasolar.com", phone: "+91-22-45678901", address: "BKC, Mumbai, Maharashtra 400051", gstNumber: "27AABCT1234I1ZU", contactPerson: "Li Wei", category: "Solar Panels" });
      const sup2 = await storage.createSupplier({ name: "Havells India Ltd", email: "b2b@havells.com", phone: "+91-11-23456789", address: "Sector 6, Noida, UP 201301", gstNumber: "09AABCH5678J1ZV", contactPerson: "Ravi Sharma", category: "Electronics" });
      const sup3 = await storage.createSupplier({ name: "Adani Solar Energy", email: "supply@adanisolar.com", phone: "+91-79-34567890", address: "SG Highway, Ahmedabad, Gujarat 380054", gstNumber: "24AABCA9012K1ZW", contactPerson: "Nitin Joshi", category: "Solar Panels" });
      const sup4 = await storage.createSupplier({ name: "Delta Electronics India", email: "sales@deltaindia.com", phone: "+91-80-45678902", address: "Electronic City, Bangalore, Karnataka 560100", gstNumber: "29AABCD3456L1ZX", contactPerson: "Karthik Reddy", category: "Electronics" });

      const prod1 = await storage.createProduct({ name: "Monocrystalline Solar Panel 400W", sku: "SP-MONO-400", category: "Solar Panels", description: "High-efficiency monocrystalline solar panel", unitPrice: "18500", unit: "pcs", minStockLevel: 50 });
      const prod2 = await storage.createProduct({ name: "Polycrystalline Solar Panel 330W", sku: "SP-POLY-330", category: "Solar Panels", description: "Cost-effective polycrystalline panel", unitPrice: "12800", unit: "pcs", minStockLevel: 75 });
      const prod3 = await storage.createProduct({ name: "Solar Inverter 5kW", sku: "INV-5KW-01", category: "Electronics", description: "Grid-tie solar inverter 5kW capacity", unitPrice: "45000", unit: "pcs", minStockLevel: 20 });
      const prod4 = await storage.createProduct({ name: "Solar Inverter 10kW", sku: "INV-10KW-01", category: "Electronics", description: "Grid-tie solar inverter 10kW capacity", unitPrice: "85000", unit: "pcs", minStockLevel: 15 });
      const prod5 = await storage.createProduct({ name: "MC4 Connector Pair", sku: "ACC-MC4-01", category: "Accessories", description: "Waterproof MC4 solar connectors", unitPrice: "150", unit: "pcs", minStockLevel: 500 });
      const prod6 = await storage.createProduct({ name: "Solar Cable 4mm (100m)", sku: "CAB-SOL-4MM", category: "Accessories", description: "UV-resistant solar DC cable", unitPrice: "3500", unit: "box", minStockLevel: 100 });
      const prod7 = await storage.createProduct({ name: "Copper Wire 2.5mm (90m)", sku: "COM-COP-25", category: "Commodities", description: "Electrical grade copper wire", unitPrice: "8500", unit: "box", minStockLevel: 60 });
      const prod8 = await storage.createProduct({ name: "Aluminium Mounting Structure", sku: "MNT-ALU-01", category: "Accessories", description: "Rooftop mounting structure for panels", unitPrice: "4200", unit: "pcs", minStockLevel: 40 });

      const wh1 = await storage.createWarehouse({ name: "Main Warehouse - Mumbai", location: "Plot 12, MIDC Industrial Area, Andheri East, Mumbai", capacity: 5000 });
      const wh2 = await storage.createWarehouse({ name: "Distribution Center - Delhi", location: "Sector 63, Noida, Uttar Pradesh", capacity: 3000 });
      const wh3 = await storage.createWarehouse({ name: "South Hub - Chennai", location: "Ambattur Industrial Estate, Chennai", capacity: 2000 });

      await storage.createSalesOrder({ orderNumber: "SO-2026-001", customerId: cust1.id, status: "confirmed", totalAmount: "370000", orderDate: new Date("2026-02-01"), notes: "10kW rooftop installation" });
      await storage.createSalesOrder({ orderNumber: "SO-2026-002", customerId: cust2.id, status: "shipped", totalAmount: "256000", orderDate: new Date("2026-02-05"), notes: "Solar panel bulk order" });
      await storage.createSalesOrder({ orderNumber: "SO-2026-003", customerId: cust3.id, status: "pending", totalAmount: "185000", orderDate: new Date("2026-02-10"), notes: "Inverter and accessories" });
      await storage.createSalesOrder({ orderNumber: "SO-2026-004", customerId: cust4.id, status: "delivered", totalAmount: "92500", orderDate: new Date("2026-01-20"), notes: "Electronic components" });
      await storage.createSalesOrder({ orderNumber: "SO-2026-005", customerId: cust5.id, status: "confirmed", totalAmount: "425000", orderDate: new Date("2026-02-12"), notes: "Commodity supply agreement" });

      await storage.createQuotation({ quoteNumber: "QT-2026-001", customerId: cust1.id, status: "sent", totalAmount: "550000", validUntil: new Date("2026-03-15"), createdAt: new Date("2026-02-01"), notes: "Large installation project quote" });
      await storage.createQuotation({ quoteNumber: "QT-2026-002", customerId: cust3.id, status: "draft", totalAmount: "180000", validUntil: new Date("2026-03-01"), createdAt: new Date("2026-02-10"), notes: "5kW system package" });
      await storage.createQuotation({ quoteNumber: "QT-2026-003", customerId: cust5.id, status: "accepted", totalAmount: "720000", validUntil: new Date("2026-04-01"), createdAt: new Date("2026-01-25"), notes: "Annual supply contract" });

      await storage.createProject({ name: "Rajesh Solar 10kW Rooftop", description: "10kW rooftop solar installation for commercial building", customerId: cust1.id, status: "in_progress", priority: "high", startDate: new Date("2026-02-01"), endDate: new Date("2026-03-15"), budget: "450000", assignedTo: null });
      await storage.createProject({ name: "GreenTech Warehouse Solar", description: "50kW ground-mounted solar for warehouse", customerId: cust2.id, status: "planning", priority: "medium", startDate: new Date("2026-03-01"), endDate: new Date("2026-05-30"), budget: "2500000", assignedTo: null });
      await storage.createProject({ name: "SunPeak Residential Complex", description: "Solar installation for 20-unit residential complex", customerId: cust3.id, status: "in_progress", priority: "high", startDate: new Date("2026-01-15"), endDate: new Date("2026-04-30"), budget: "1800000", assignedTo: null });
      await storage.createProject({ name: "Bharat Electronics Retrofit", description: "Inverter upgrade and panel replacement", customerId: cust4.id, status: "completed", priority: "low", startDate: new Date("2025-12-01"), endDate: new Date("2026-01-30"), budget: "350000", assignedTo: null });

      await storage.createPurchaseOrder({ poNumber: "PO-2026-001", supplierId: sup1.id, status: "received", totalAmount: "925000", orderDate: new Date("2026-01-15"), expectedDelivery: new Date("2026-02-01"), notes: "50x Mono 400W panels" });
      await storage.createPurchaseOrder({ poNumber: "PO-2026-002", supplierId: sup2.id, status: "approved", totalAmount: "450000", orderDate: new Date("2026-02-05"), expectedDelivery: new Date("2026-02-20"), notes: "10x 5kW inverters" });
      await storage.createPurchaseOrder({ poNumber: "PO-2026-003", supplierId: sup3.id, status: "shipped", totalAmount: "640000", orderDate: new Date("2026-02-08"), expectedDelivery: new Date("2026-02-25"), notes: "50x Poly 330W panels" });
      await storage.createPurchaseOrder({ poNumber: "PO-2026-004", supplierId: sup4.id, status: "pending", totalAmount: "170000", orderDate: new Date("2026-02-12"), expectedDelivery: new Date("2026-03-05"), notes: "2x 10kW inverters" });

      const inv1 = await storage.createInvoice({ invoiceNumber: "INV-2026-001", customerId: cust1.id, orderId: null, amount: "370000", status: "paid", dueDate: new Date("2026-03-01"), issuedDate: new Date("2026-02-01") });
      const inv2 = await storage.createInvoice({ invoiceNumber: "INV-2026-002", customerId: cust2.id, orderId: null, amount: "256000", status: "unpaid", dueDate: new Date("2026-03-05"), issuedDate: new Date("2026-02-05") });
      const inv3 = await storage.createInvoice({ invoiceNumber: "INV-2026-003", customerId: cust3.id, orderId: null, amount: "185000", status: "unpaid", dueDate: new Date("2026-03-10"), issuedDate: new Date("2026-02-10") });
      const inv4 = await storage.createInvoice({ invoiceNumber: "INV-2026-004", customerId: cust4.id, orderId: null, amount: "92500", status: "paid", dueDate: new Date("2026-02-20"), issuedDate: new Date("2026-01-20") });
      const inv5 = await storage.createInvoice({ invoiceNumber: "INV-2026-005", customerId: cust5.id, orderId: null, amount: "425000", status: "partial", dueDate: new Date("2026-03-12"), issuedDate: new Date("2026-02-12") });

      await storage.createPayment({ invoiceId: inv1.id, amount: "370000", method: "bank_transfer", status: "completed", paymentDate: new Date("2026-02-10"), reference: "NEFT/2026/0210/001" });
      await storage.createPayment({ invoiceId: inv4.id, amount: "92500", method: "upi", status: "completed", paymentDate: new Date("2026-02-05"), reference: "UPI/2026/0205/045" });
      await storage.createPayment({ invoiceId: inv5.id, amount: "200000", method: "cheque", status: "completed", paymentDate: new Date("2026-02-13"), reference: "CHQ/467892" });

      const emp1 = await storage.createEmployee({ name: "Vikram Singh", email: "vikram@nexerp.com", phone: "+91-9812345678", department: "Sales", designation: "Sales Manager", joinDate: new Date("2024-06-15"), isActive: true, salary: "65000", userId: null, qrCode: null, company: null });
      const emp2 = await storage.createEmployee({ name: "Anita Desai", email: "anita@nexerp.com", phone: "+91-9823456789", department: "Operations", designation: "Operations Head", joinDate: new Date("2024-03-01"), isActive: true, salary: "75000", userId: null, qrCode: null, company: null });
      const emp3 = await storage.createEmployee({ name: "Mohammed Khan", email: "khan@nexerp.com", phone: "+91-9834567890", department: "Warehouse", designation: "Warehouse Manager", joinDate: new Date("2024-08-20"), isActive: true, salary: "55000", userId: null, qrCode: null, company: null });
      const emp4 = await storage.createEmployee({ name: "Priya Nair", email: "priya@nexerp.com", phone: "+91-9845678901", department: "Finance", designation: "Senior Accountant", joinDate: new Date("2024-04-10"), isActive: true, salary: "60000", userId: null, qrCode: null, company: null });
      const emp5 = await storage.createEmployee({ name: "Rahul Verma", email: "rahul@nexerp.com", phone: "+91-9856789012", department: "Sales", designation: "Field Executive", joinDate: new Date("2025-01-05"), isActive: true, salary: "35000", userId: null, qrCode: null, company: null });
      const emp6 = await storage.createEmployee({ name: "Sneha Patil", email: "sneha@nexerp.com", phone: "+91-9867890123", department: "HR", designation: "HR Manager", joinDate: new Date("2024-07-01"), isActive: true, salary: "58000", userId: null, qrCode: null, company: null });
      const emp7 = await storage.createEmployee({ name: "Arjun Reddy", email: "arjun@nexerp.com", phone: "+91-9878901234", department: "IT", designation: "Technical Lead", joinDate: new Date("2024-02-15"), isActive: true, salary: "80000", userId: null, qrCode: null, company: null });

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);
      for (const emp of [emp1, emp2, emp3, emp4, emp5, emp6, emp7]) {
        await storage.createAttendanceRecord({ employeeId: emp.id, date: pastDate, checkIn: new Date(pastDate.getFullYear(), pastDate.getMonth(), pastDate.getDate(), 9, 0), checkOut: new Date(pastDate.getFullYear(), pastDate.getMonth(), pastDate.getDate(), 18, 0), lunchOut: null, lunchIn: null, teaOut: null, teaIn: null, status: "present", selfieUrl: null, location: null });
      }

      await logAction(admin.id, "seed", "system", "Demo data seeded successfully");
      console.log("Demo data seeded successfully");
    } catch (seedError) {
      console.error("Error seeding demo data:", seedError);
    }
  }

  // One-time cleanup: remove seed attendance records for today (seed used to create today's records)
  try {
    const allAttendance = await storage.getAttendance();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const seedRecordsToday = allAttendance.filter(a => {
      const aDate = new Date(a.date);
      aDate.setHours(0, 0, 0, 0);
      if (aDate.getTime() !== today.getTime()) return false;
      if (a.selfieUrl) return false;
      const checkIn = new Date(a.checkIn!);
      return checkIn.getHours() === 9 && checkIn.getMinutes() === 0;
    });
    if (seedRecordsToday.length > 0) {
      for (const rec of seedRecordsToday) {
        await storage.deleteAttendanceRecord(rec.id);
      }
      console.log(`Cleaned up ${seedRecordsToday.length} seed attendance records for today`);
    }
  } catch (cleanupError) {
    console.error("Attendance cleanup error:", cleanupError);
  }

  // ======================== AUTH ========================
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
      if (!user.isActive) {
        return res.status(401).json({ message: "Account is deactivated" });
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

      await logAction(user.id, "login", "auth", `User ${user.username} logged in`);

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
      console.error("Login error:", error);
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

  // ======================== DASHBOARD ========================
  app.get("/api/dashboard/stats", authenticateToken, async (req: any, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // ======================== USERS ========================
  app.get("/api/users", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const data = await storage.getUsers();
      const sanitized = data.map(u => ({ ...u, password: undefined }));
      res.json(sanitized);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/users", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const data = parsed.data;
      data.password = await bcrypt.hash(data.password, 10);
      const created = await storage.createUser(data);
      await logAction(req.user.id, "create", "users", `Created user ${data.username}`);
      res.status(201).json({ ...created, password: undefined });
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "Username already exists" });
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // ======================== CUSTOMERS ========================
  app.get("/api/customers", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getCustomers();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.get("/api/customers/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getCustomer(req.params.id);
      if (!data) return res.status(404).json({ message: "Customer not found" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  app.post("/api/customers", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertCustomerSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createCustomer(parsed.data as any);
      await logAction(req.user.id, "create", "customers", `Created customer ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create customer" });
    }
  });

  app.patch("/api/customers/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateCustomer(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Customer not found" });
      await logAction(req.user.id, "update", "customers", `Updated customer ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update customer" });
    }
  });

  app.delete("/api/customers/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteCustomer(req.params.id);
      await logAction(req.user.id, "delete", "customers", `Deleted customer ${req.params.id}`);
      res.json({ message: "Customer deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete customer" });
    }
  });

  // ======================== SUPPLIERS ========================
  app.get("/api/suppliers", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getSuppliers();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch suppliers" });
    }
  });

  app.get("/api/suppliers/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getSupplier(req.params.id);
      if (!data) return res.status(404).json({ message: "Supplier not found" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch supplier" });
    }
  });

  app.post("/api/suppliers", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertSupplierSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createSupplier(parsed.data as any);
      await logAction(req.user.id, "create", "suppliers", `Created supplier ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create supplier" });
    }
  });

  app.patch("/api/suppliers/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateSupplier(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Supplier not found" });
      await logAction(req.user.id, "update", "suppliers", `Updated supplier ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update supplier" });
    }
  });

  app.delete("/api/suppliers/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteSupplier(req.params.id);
      await logAction(req.user.id, "delete", "suppliers", `Deleted supplier ${req.params.id}`);
      res.json({ message: "Supplier deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete supplier" });
    }
  });

  // ======================== PRODUCTS ========================
  app.get("/api/products", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getProducts();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getProduct(req.params.id);
      if (!data) return res.status(404).json({ message: "Product not found" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.post("/api/products", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertProductSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createProduct(parsed.data as any);
      await logAction(req.user.id, "create", "products", `Created product ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "SKU already exists" });
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.patch("/api/products/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateProduct(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Product not found" });
      await logAction(req.user.id, "update", "products", `Updated product ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteProduct(req.params.id);
      await logAction(req.user.id, "delete", "products", `Deleted product ${req.params.id}`);
      res.json({ message: "Product deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // ======================== WAREHOUSES ========================
  app.get("/api/warehouses", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getWarehouses();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch warehouses" });
    }
  });

  app.post("/api/warehouses", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertWarehouseSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createWarehouse(parsed.data as any);
      await logAction(req.user.id, "create", "warehouses", `Created warehouse ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create warehouse" });
    }
  });

  app.patch("/api/warehouses/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateWarehouse(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Warehouse not found" });
      await logAction(req.user.id, "update", "warehouses", `Updated warehouse ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update warehouse" });
    }
  });

  app.delete("/api/warehouses/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteWarehouse(req.params.id);
      await logAction(req.user.id, "delete", "warehouses", `Deleted warehouse ${req.params.id}`);
      res.json({ message: "Warehouse deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete warehouse" });
    }
  });

  // ======================== INVENTORY STOCK ========================
  app.get("/api/inventory-stock", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getInventoryStock();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch inventory stock" });
    }
  });

  app.post("/api/inventory-stock", authenticateToken, async (req: any, res) => {
    try {
      const created = await storage.createInventoryStock(req.body);
      await logAction(req.user.id, "create", "inventory", `Added stock entry`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create inventory stock" });
    }
  });

  app.patch("/api/inventory-stock/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateInventoryStock(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Stock entry not found" });
      await logAction(req.user.id, "update", "inventory", `Updated stock entry`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update inventory stock" });
    }
  });

  // ======================== SALES ORDERS ========================
  app.get("/api/sales-orders", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getSalesOrders();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sales orders" });
    }
  });

  app.get("/api/sales-orders/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getSalesOrder(req.params.id);
      if (!data) return res.status(404).json({ message: "Sales order not found" });
      const items = await storage.getSalesOrderItems(req.params.id);
      res.json({ ...data, items });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sales order" });
    }
  });

  app.post("/api/sales-orders", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertSalesOrderSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createSalesOrder(parsed.data as any);
      await logAction(req.user.id, "create", "sales", `Created sales order ${parsed.data.orderNumber}`);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "Order number already exists" });
      res.status(500).json({ message: "Failed to create sales order" });
    }
  });

  app.patch("/api/sales-orders/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateSalesOrder(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Sales order not found" });
      await logAction(req.user.id, "update", "sales", `Updated sales order ${updated.orderNumber}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update sales order" });
    }
  });

  app.delete("/api/sales-orders/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteSalesOrder(req.params.id);
      await logAction(req.user.id, "delete", "sales", `Deleted sales order ${req.params.id}`);
      res.json({ message: "Sales order deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete sales order" });
    }
  });

  // ======================== QUOTATIONS ========================
  app.get("/api/quotations", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getQuotations();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch quotations" });
    }
  });

  app.post("/api/quotations", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertQuotationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createQuotation(parsed.data as any);
      await logAction(req.user.id, "create", "sales", `Created quotation ${parsed.data.quoteNumber}`);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "Quote number already exists" });
      res.status(500).json({ message: "Failed to create quotation" });
    }
  });

  app.patch("/api/quotations/:id", authenticateToken, async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (body.validUntil !== undefined) {
        body.validUntil = body.validUntil ? new Date(body.validUntil) : null;
      }
      const updated = await storage.updateQuotation(req.params.id, body);
      if (!updated) return res.status(404).json({ message: "Quotation not found" });
      await logAction(req.user.id, "update", "sales", `Updated quotation ${updated.quoteNumber}`);
      res.json(updated);
    } catch (error: any) {
      console.error("Failed to update quotation:", error?.message || error);
      res.status(500).json({ message: "Failed to update quotation" });
    }
  });

  app.delete("/api/quotations/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteQuotation(req.params.id);
      await logAction(req.user.id, "delete", "sales", `Deleted quotation ${req.params.id}`);
      res.json({ message: "Quotation deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete quotation" });
    }
  });

  // ======================== SALES ORDER ITEMS ========================
  app.get("/api/sales-orders/:id/items", authenticateToken, async (req, res) => {
    try {
      const items = await storage.getSalesOrderItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch order items" });
    }
  });

  app.post("/api/sales-orders/:id/items", authenticateToken, async (req: any, res) => {
    try {
      const items = req.body.items;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Items must be a non-empty array" });
      await storage.deleteSalesOrderItems(req.params.id);
      const created = [];
      for (const item of items) {
        const parsed = insertSalesOrderItemSchema.parse({ ...item, orderId: req.params.id });
        const c = await storage.createSalesOrderItem(parsed);
        created.push(c);
      }
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid item data", errors: error.errors });
      res.status(500).json({ message: "Failed to save order items" });
    }
  });

  // ======================== QUOTATION ITEMS ========================
  app.get("/api/quotations/:id/items", authenticateToken, async (req, res) => {
    try {
      const items = await storage.getQuotationItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch quotation items" });
    }
  });

  app.post("/api/quotations/:id/items", authenticateToken, async (req: any, res) => {
    try {
      const items = req.body.items;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Items must be a non-empty array" });
      await storage.deleteQuotationItems(req.params.id);
      const created = [];
      for (const item of items) {
        const parsed = insertQuotationItemSchema.parse({ ...item, quotationId: req.params.id });
        const c = await storage.createQuotationItem(parsed);
        created.push(c);
      }
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid item data", errors: error.errors });
      res.status(500).json({ message: "Failed to save quotation items" });
    }
  });

  // ======================== CONVERT QUOTATION TO ORDER ========================
  app.post("/api/quotations/:id/convert-to-order", authenticateToken, async (req: any, res) => {
    try {
      const quotation = await storage.getQuotation(req.params.id);
      if (!quotation) return res.status(404).json({ message: "Quotation not found" });
      if (quotation.status === "accepted") return res.status(400).json({ message: "Quotation already converted" });

      const orderNumber = `SO-${Date.now().toString(36).toUpperCase()}`;
      const order = await storage.createSalesOrder({
        orderNumber,
        customerId: quotation.customerId,
        status: "pending",
        totalAmount: quotation.totalAmount,
        orderDate: new Date(),
        notes: `Converted from quotation ${quotation.quoteNumber}. ${quotation.notes || ""}`.trim(),
        discountType: quotation.discountType,
        discountValue: quotation.discountValue,
        paymentTerms: null,
        advanceAmount: null,
        paidAmount: "0",
      });

      const quotationItems = await storage.getQuotationItems(req.params.id);
      for (const qi of quotationItems) {
        await storage.createSalesOrderItem({
          orderId: order.id,
          productId: qi.productId,
          description: qi.description,
          itemType: qi.itemType,
          quantity: qi.quantity,
          unitPrice: qi.unitPrice,
          totalPrice: qi.totalPrice,
        });
      }

      await storage.updateQuotation(req.params.id, { status: "accepted" });
      await logAction(req.user.id, "create", "sales", `Converted quotation ${quotation.quoteNumber} to order ${orderNumber}`);

      res.status(201).json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to convert quotation to order" });
    }
  });

  // ======================== LEADS ========================
  app.get("/api/leads", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getLeads();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  app.get("/api/leads/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getLead(req.params.id);
      if (!data) return res.status(404).json({ message: "Lead not found" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch lead" });
    }
  });

  app.post("/api/leads", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertLeadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createLead(parsed.data as any);
      await logAction(req.user.id, "create", "leads", `Created lead ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create lead" });
    }
  });

  app.patch("/api/leads/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateLead(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Lead not found" });
      await logAction(req.user.id, "update", "leads", `Updated lead ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update lead" });
    }
  });

  app.delete("/api/leads/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteLead(req.params.id);
      await logAction(req.user.id, "delete", "leads", `Deleted lead ${req.params.id}`);
      res.json({ message: "Lead deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete lead" });
    }
  });

  app.post("/api/leads/:id/convert-to-quotation", authenticateToken, async (req: any, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) return res.status(404).json({ message: "Lead not found" });
      if (lead.quotationId || lead.status === "quotation_sent" || lead.status === "won") {
        return res.status(400).json({ message: "Lead already converted" });
      }

      let customer;
      if (lead.company) {
        const allCustomers = await storage.getCustomers();
        customer = allCustomers.find(c => c.name.toLowerCase() === lead.company!.toLowerCase());
        if (!customer) {
          customer = await storage.createCustomer({
            name: lead.company,
            email: lead.email || null,
            phone: lead.phone || null,
            address: lead.address || null,
            gstNumber: lead.gstNumber || null,
            contactPerson: lead.name,
          });
        }
      } else {
        customer = await storage.createCustomer({
          name: lead.name,
          email: lead.email || null,
          phone: lead.phone || null,
          address: lead.address || null,
          gstNumber: lead.gstNumber || null,
          contactPerson: lead.name,
        });
      }

      const quoteNumber = `QT-${Date.now().toString(36).toUpperCase()}`;
      const quotation = await storage.createQuotation({
        quoteNumber,
        customerId: customer.id,
        status: "draft",
        totalAmount: lead.estimatedValue || "0",
        validUntil: null,
        createdAt: new Date(),
        notes: lead.requirement || null,
        discountType: null,
        discountValue: null,
      });

      const updatedLead = await storage.updateLead(req.params.id, {
        status: "quotation_sent",
        quotationId: quotation.id,
      });

      await logAction(req.user.id, "create", "leads", `Converted lead ${lead.name} to quotation ${quoteNumber}`);

      res.status(201).json({ lead: updatedLead, quotation, customer });
    } catch (error) {
      res.status(500).json({ message: "Failed to convert lead to quotation" });
    }
  });

  // ======================== ORDER PAYMENTS & INVOICES ========================
  app.post("/api/sales-orders/:id/record-payment", authenticateToken, async (req: any, res) => {
    try {
      const order = await storage.getSalesOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });

      const { amount, method, reference } = req.body;
      if (!amount || !method) return res.status(400).json({ message: "Amount and method are required" });

      const paymentAmount = parseFloat(amount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) return res.status(400).json({ message: "Invalid amount" });

      const currentPaid = parseFloat(order.paidAmount || "0");
      const orderTotal = parseFloat(order.totalAmount);
      if (currentPaid + paymentAmount > orderTotal) {
        return res.status(400).json({ message: `Payment exceeds balance. Remaining: ₹${(orderTotal - currentPaid).toFixed(2)}` });
      }
      const newPaidAmount = (currentPaid + paymentAmount).toFixed(2);

      const payment = await storage.createPayment({
        invoiceId: null,
        amount: paymentAmount.toFixed(2),
        method,
        status: "completed",
        paymentDate: new Date(),
        reference: reference || `Order ${order.orderNumber}`,
      });

      const updatedOrder = await storage.updateSalesOrder(req.params.id, {
        paidAmount: newPaidAmount,
      });

      await logAction(req.user.id, "create", "sales", `Recorded payment ₹${paymentAmount} for order ${order.orderNumber}`);

      res.status(201).json({ order: updatedOrder, payment });
    } catch (error) {
      res.status(500).json({ message: "Failed to record payment" });
    }
  });

  app.post("/api/sales-orders/:id/generate-invoice", authenticateToken, async (req: any, res) => {
    try {
      const order = await storage.getSalesOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });

      const allInvoices = await storage.getInvoices();
      const existingInvoices = allInvoices.filter(inv => inv.orderId === order.id);
      const invoicedTotal = existingInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
      const orderTotal = parseFloat(order.totalAmount);
      const remainingAmount = orderTotal - invoicedTotal;

      if (remainingAmount <= 0) {
        return res.status(400).json({ message: "Order already fully invoiced" });
      }

      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
      const invoice = await storage.createInvoice({
        invoiceNumber,
        orderId: order.id,
        customerId: order.customerId,
        amount: remainingAmount.toFixed(2),
        status: "unpaid",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        issuedDate: new Date(),
      });

      await logAction(req.user.id, "create", "accounts", `Generated invoice ${invoiceNumber} from order ${order.orderNumber}`);

      res.status(201).json(invoice);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  // ======================== PROJECTS ========================
  app.get("/api/projects", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getProjects();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getProject(req.params.id);
      if (!data) return res.status(404).json({ message: "Project not found" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertProjectSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createProject(parsed.data as any);
      await logAction(req.user.id, "create", "projects", `Created project ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateProject(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Project not found" });
      await logAction(req.user.id, "update", "projects", `Updated project ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteProject(req.params.id);
      await logAction(req.user.id, "delete", "projects", `Deleted project ${req.params.id}`);
      res.json({ message: "Project deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // ======================== PURCHASE ORDERS ========================
  app.get("/api/purchase-orders", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getPurchaseOrders();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch purchase orders" });
    }
  });

  app.post("/api/purchase-orders", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertPurchaseOrderSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createPurchaseOrder(parsed.data as any);
      await logAction(req.user.id, "create", "supply_chain", `Created PO ${parsed.data.poNumber}`);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "PO number already exists" });
      res.status(500).json({ message: "Failed to create purchase order" });
    }
  });

  app.patch("/api/purchase-orders/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updatePurchaseOrder(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Purchase order not found" });
      await logAction(req.user.id, "update", "supply_chain", `Updated PO ${updated.poNumber}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update purchase order" });
    }
  });

  app.delete("/api/purchase-orders/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deletePurchaseOrder(req.params.id);
      await logAction(req.user.id, "delete", "supply_chain", `Deleted PO ${req.params.id}`);
      res.json({ message: "Purchase order deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete purchase order" });
    }
  });

  // ======================== INVOICES ========================
  app.get("/api/invoices", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getInvoices();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.post("/api/invoices", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertInvoiceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createInvoice(parsed.data as any);
      await logAction(req.user.id, "create", "accounts", `Created invoice ${parsed.data.invoiceNumber}`);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "Invoice number already exists" });
      res.status(500).json({ message: "Failed to create invoice" });
    }
  });

  app.patch("/api/invoices/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateInvoice(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Invoice not found" });
      await logAction(req.user.id, "update", "accounts", `Updated invoice ${updated.invoiceNumber}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update invoice" });
    }
  });

  app.delete("/api/invoices/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteInvoice(req.params.id);
      await logAction(req.user.id, "delete", "accounts", `Deleted invoice ${req.params.id}`);
      res.json({ message: "Invoice deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete invoice" });
    }
  });

  // ======================== PAYMENTS ========================
  app.get("/api/payments", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getPayments();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.post("/api/payments", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertPaymentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createPayment(parsed.data as any);
      await logAction(req.user.id, "create", "accounts", `Recorded payment of ₹${parsed.data.amount}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create payment" });
    }
  });

  app.patch("/api/payments/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updatePayment(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Payment not found" });
      await logAction(req.user.id, "update", "accounts", `Updated payment ${updated.id}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update payment" });
    }
  });

  app.delete("/api/payments/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deletePayment(req.params.id);
      await logAction(req.user.id, "delete", "accounts", `Deleted payment ${req.params.id}`);
      res.json({ message: "Payment deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete payment" });
    }
  });

  // ======================== EMPLOYEES ========================
  app.get("/api/employees", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getEmployees();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.get("/api/employees/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getEmployee(req.params.id);
      if (!data) return res.status(404).json({ message: "Employee not found" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch employee" });
    }
  });

  app.post("/api/employees", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertEmployeeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createEmployee(parsed.data as any);
      await logAction(req.user.id, "create", "employees", `Added employee ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create employee" });
    }
  });

  app.patch("/api/employees/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateEmployee(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Employee not found" });
      await logAction(req.user.id, "update", "employees", `Updated employee ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update employee" });
    }
  });

  app.delete("/api/employees/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteEmployee(req.params.id);
      await logAction(req.user.id, "delete", "employees", `Deleted employee ${req.params.id}`);
      res.json({ message: "Employee deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete employee" });
    }
  });

  // ======================== ATTENDANCE ========================
  app.get("/api/attendance", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getAttendance();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch attendance" });
    }
  });

  app.post("/api/attendance", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertAttendanceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createAttendanceRecord(parsed.data as any);
      await logAction(req.user.id, "create", "attendance", `Recorded attendance for employee ${parsed.data.employeeId}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to record attendance" });
    }
  });

  // ======================== FIELD STAFF ACTIVITIES ========================
  app.get("/api/field-activities", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getFieldStaffActivities();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch field activities" });
    }
  });

  app.post("/api/field-activities", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertFieldStaffActivitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createFieldStaffActivity(parsed.data as any);
      await logAction(req.user.id, "create", "field_activities", `Logged field activity`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to log field activity" });
    }
  });

  // ======================== PAYROLL STATUS ========================
  app.get("/api/payroll-status", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getPayrollStatuses();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payroll statuses" });
    }
  });

  app.get("/api/payroll-status/:month/:year", authenticateToken, async (req, res) => {
    try {
      const month = parseInt(req.params.month);
      const year = parseInt(req.params.year);
      let data = await storage.getPayrollStatus(month, year);
      const now = new Date();
      const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      if (!data && month === lastMonth && year === lastMonthYear && now.getDate() >= 2) {
        data = await storage.createPayrollStatus({ month, year, status: "pending", totalAmount: null, disbursedAt: null });
      }
      res.json(data || null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payroll status" });
    }
  });

  app.post("/api/payroll-status", authenticateToken, async (req: any, res) => {
    try {
      const { month, year, totalAmount } = req.body;
      const existing = await storage.getPayrollStatus(month, year);
      if (existing) {
        return res.json(existing);
      }
      const created = await storage.createPayrollStatus({ month, year, status: "pending", totalAmount: totalAmount || "0", disbursedAt: null });
      res.json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create payroll status" });
    }
  });

  app.patch("/api/payroll-status/:id/disburse", authenticateToken, async (req, res) => {
    try {
      const updated = await storage.updatePayrollStatus(req.params.id, { status: "disbursed", disbursedAt: new Date() });
      if (!updated) return res.status(404).json({ message: "Payroll status not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update payroll status" });
    }
  });

  // ======================== AUDIT LOGS ========================
  app.get("/api/audit-logs", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getAuditLogs();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // ======================== OBJECT STORAGE ========================
  registerObjectStorageRoutes(app);

  // ======================== KIOSK ATTENDANCE ========================

  app.get("/api/kiosk/employee/:qrCode", async (req, res) => {
    try {
      const qrCode = decodeURIComponent(req.params.qrCode).trim();
      const employees = await storage.getEmployees();
      const employee = employees.find(e => e.qrCode === qrCode && e.isActive);
      if (!employee) return res.status(404).json({ message: "Employee not found or inactive" });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const allAttendance = await storage.getAttendance();
      const todayRecord = allAttendance.find(a => {
        const aDate = new Date(a.date);
        aDate.setHours(0, 0, 0, 0);
        return a.employeeId === employee.id && aDate.getTime() === today.getTime();
      });

      res.json({
        id: employee.id,
        name: employee.name,
        department: employee.department,
        designation: employee.designation,
        todayAttendance: todayRecord || null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to lookup employee" });
    }
  });

  app.post("/api/kiosk/attendance", async (req, res) => {
    try {
      const { qrCode, selfieUrl, action, location } = req.body;
      if (!qrCode) return res.status(400).json({ message: "QR code required" });

      const employees = await storage.getEmployees();
      const employee = employees.find(e => e.qrCode === qrCode && e.isActive);
      if (!employee) return res.status(404).json({ message: "Invalid QR code or employee inactive" });
      const employeeId = employee.id;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allAttendance = await storage.getAttendance();
      const todayRecord = allAttendance.find(a => {
        const aDate = new Date(a.date);
        aDate.setHours(0, 0, 0, 0);
        return a.employeeId === employeeId && aDate.getTime() === today.getTime();
      });

      const now = new Date();

      if (!todayRecord) {
        const checkInHour = now.getHours();
        const checkInMin = now.getMinutes();
        const checkInSec = now.getSeconds();
        const totalSeconds = checkInHour * 3600 + checkInMin * 60 + checkInSec;
        const graceDeadline = 9 * 3600 + 35 * 60; // 9:35:00 AM
        const isLate = totalSeconds > graceDeadline;
        const status = isLate ? "half_day" : "present";

        const created = await storage.createAttendanceRecord({
          employeeId,
          date: today,
          checkIn: now,
          checkOut: null,
          lunchOut: null,
          lunchIn: null,
          teaOut: null,
          teaIn: null,
          status,
          selfieUrl: selfieUrl || null,
          location: location || null,
        });
        const message = isLate ? "Checked in - Marked as Half Day (Late arrival)" : "Checked in successfully";
        return res.json({ type: "check_in", message, record: created, isLate });
      }

      if (todayRecord.checkOut) {
        return res.json({ type: "already_done", message: "Attendance already completed for today", record: todayRecord });
      }

      if (action === "lunch_out") {
        if (todayRecord.lunchOut) return res.status(400).json({ message: "Lunch break already taken" });
        const updated = await storage.updateAttendanceRecord(todayRecord.id, { lunchOut: now, selfieUrl: selfieUrl || todayRecord.selfieUrl, location: location || todayRecord.location });
        return res.json({ type: "lunch_out", message: "Going for Lunch Break", record: updated });
      }

      if (action === "lunch_in") {
        if (!todayRecord.lunchOut) return res.status(400).json({ message: "Lunch out not recorded" });
        if (todayRecord.lunchIn) return res.status(400).json({ message: "Already back from lunch" });
        const updated = await storage.updateAttendanceRecord(todayRecord.id, { lunchIn: now, selfieUrl: selfieUrl || todayRecord.selfieUrl, location: location || todayRecord.location });
        return res.json({ type: "lunch_in", message: "Back from Lunch Break", record: updated });
      }

      if (action === "tea_out") {
        if (todayRecord.teaOut) return res.status(400).json({ message: "Tea break already taken" });
        const updated = await storage.updateAttendanceRecord(todayRecord.id, { teaOut: now, selfieUrl: selfieUrl || todayRecord.selfieUrl, location: location || todayRecord.location });
        return res.json({ type: "tea_out", message: "Going for Tea Break", record: updated });
      }

      if (action === "tea_in") {
        if (!todayRecord.teaOut) return res.status(400).json({ message: "Tea out not recorded" });
        if (todayRecord.teaIn) return res.status(400).json({ message: "Already back from tea" });
        const updated = await storage.updateAttendanceRecord(todayRecord.id, { teaIn: now, selfieUrl: selfieUrl || todayRecord.selfieUrl, location: location || todayRecord.location });
        return res.json({ type: "tea_in", message: "Back from Tea Break", record: updated });
      }

      if (action === "check_out") {
        const updated = await storage.updateAttendanceRecord(todayRecord.id, { checkOut: now, selfieUrl: selfieUrl || todayRecord.selfieUrl, location: location || todayRecord.location });
        return res.json({ type: "check_out", message: "Checked out successfully", record: updated });
      }

      return res.status(400).json({ message: "Invalid action" });
    } catch (error) {
      console.error("Kiosk attendance error:", error);
      res.status(500).json({ message: "Failed to record attendance" });
    }
  });

  // ======================== TRAVEL EXPENSES ========================
  app.get("/api/travel-expenses", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getTravelExpenses();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch travel expenses" });
    }
  });

  app.get("/api/travel-expenses/employee/:employeeId", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getTravelExpensesByEmployee(req.params.employeeId);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch travel expenses" });
    }
  });

  app.post("/api/travel-expenses", authenticateToken, async (req: any, res) => {
    try {
      const { employeeId, originLat, originLng, destLat, destLng, originAddress, destAddress, transportMode, notes } = req.body;
      const oLat = parseFloat(originLat); const oLng = parseFloat(originLng);
      const dLat = parseFloat(destLat); const dLng = parseFloat(destLng);
      if (!employeeId || isNaN(oLat) || isNaN(oLng) || isNaN(dLat) || isNaN(dLng)) {
        return res.status(400).json({ message: "Missing or invalid required fields" });
      }
      const allEmployees = await storage.getEmployees();
      const empExists = allEmployees.find(e => e.id === employeeId);
      if (!empExists) {
        return res.status(400).json({ message: "Employee not found" });
      }
      const validModes = ["bus", "train", "bike"];
      if (!validModes.includes(transportMode)) {
        return res.status(400).json({ message: "Invalid transport mode" });
      }
      const rates: Record<string, number> = { bus: 10, train: 5, bike: 20 };
      const R = 6371;
      const dLatR = (dLat - oLat) * Math.PI / 180;
      const dLonR = (dLng - oLng) * Math.PI / 180;
      const a = Math.sin(dLatR / 2) ** 2 + Math.cos(oLat * Math.PI / 180) * Math.cos(dLat * Math.PI / 180) * Math.sin(dLonR / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.3;
      const computedTravelCost = Math.round(dist * rates[transportMode]);
      const lunchMoney = 200;
      const computedTotal = computedTravelCost + lunchMoney;
      const created = await storage.createTravelExpense({
        employeeId, date: new Date(), originLat: String(oLat), originLng: String(oLng),
        destLat: String(dLat), destLng: String(dLng), originAddress: originAddress || null,
        destAddress: destAddress || null, distance: String(dist.toFixed(2)), transportMode,
        travelCost: String(computedTravelCost), lunchMoney: String(lunchMoney),
        totalAmount: String(computedTotal), status: "pending", notes: notes || null,
        approvedAt: null, disbursedAt: null, createdAt: new Date(),
      });
      await logAction(req.user.id, "create", "travel_expenses", `Travel expense created for employee ${employeeId}`);
      res.status(201).json(created);
    } catch (error) {
      console.error("Travel expense error:", error);
      res.status(500).json({ message: "Failed to create travel expense" });
    }
  });

  app.patch("/api/travel-expenses/:id/approve", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateTravelExpense(req.params.id, { status: "approved", approvedAt: new Date() });
      if (!updated) return res.status(404).json({ message: "Travel expense not found" });
      await logAction(req.user.id, "approve", "travel_expenses", `Approved travel expense ${req.params.id}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to approve travel expense" });
    }
  });

  app.patch("/api/travel-expenses/:id/disburse", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateTravelExpense(req.params.id, { status: "disbursed", disbursedAt: new Date() });
      if (!updated) return res.status(404).json({ message: "Travel expense not found" });
      await logAction(req.user.id, "disburse", "travel_expenses", `Disbursed travel expense ${req.params.id}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to disburse travel expense" });
    }
  });

  // ======================== LOCATION LOGS ========================
  app.get("/api/location-logs", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getLocationLogs();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch location logs" });
    }
  });

  app.get("/api/location-logs/employee/:employeeId", authenticateToken, async (req, res) => {
    try {
      const { startDate, endDate } = req.query as any;
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;
      const data = await storage.getLocationLogsByEmployee(req.params.employeeId, start, end);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch location logs" });
    }
  });

  app.get("/api/location-logs/employee/:employeeId/latest", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getLatestLocationByEmployee(req.params.employeeId);
      res.json(data || null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch latest location" });
    }
  });

  app.post("/api/location-logs", authenticateToken, async (req: any, res) => {
    try {
      const { employeeId, lat, lng, tripActive, tripId } = req.body;
      const parsedLat = parseFloat(lat); const parsedLng = parseFloat(lng);
      if (!employeeId || isNaN(parsedLat) || isNaN(parsedLng)) {
        return res.status(400).json({ message: "Missing or invalid required fields" });
      }
      const allEmps = await storage.getEmployees();
      if (!allEmps.find(e => e.id === employeeId)) {
        return res.status(400).json({ message: "Employee not found" });
      }
      const created = await storage.createLocationLog({
        employeeId, tripId: tripId || null, lat: String(parsedLat), lng: String(parsedLng),
        timestamp: new Date(), tripActive: tripActive !== false,
      });
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create location log" });
    }
  });

  // Trips
  app.get("/api/trips", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getTrips();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trips" });
    }
  });

  app.get("/api/trips/active", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getActiveTrips();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch active trips" });
    }
  });

  app.get("/api/trips/employee/:employeeId", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getTripsByEmployee(req.params.employeeId);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trips" });
    }
  });

  app.get("/api/trips/:id/route", authenticateToken, async (req, res) => {
    try {
      const logs = await storage.getLocationLogsByTrip(req.params.id);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trip route" });
    }
  });

  app.post("/api/trips/start", authenticateToken, async (req: any, res) => {
    try {
      const { employeeId, lat, lng } = req.body;
      if (!employeeId) return res.status(400).json({ message: "Employee ID required" });
      const allEmps = await storage.getEmployees();
      if (!allEmps.find(e => e.id === employeeId)) {
        return res.status(400).json({ message: "Employee not found" });
      }
      const existingActive = await storage.getActiveTrips();
      const alreadyActive = existingActive.find(t => t.employeeId === employeeId);
      if (alreadyActive) {
        return res.status(400).json({ message: "Employee already has an active trip" });
      }
      const parsedLat = lat ? parseFloat(lat) : null;
      const parsedLng = lng ? parseFloat(lng) : null;
      const trip = await storage.createTrip({
        employeeId,
        startTime: new Date(),
        endTime: null,
        startLat: parsedLat !== null ? String(parsedLat) : null,
        startLng: parsedLng !== null ? String(parsedLng) : null,
        endLat: null,
        endLng: null,
        status: "active",
        date: new Date(),
      });
      if (parsedLat !== null && parsedLng !== null) {
        await storage.createLocationLog({
          employeeId, tripId: trip.id, lat: String(parsedLat), lng: String(parsedLng),
          timestamp: new Date(), tripActive: true,
        });
      }
      res.status(201).json(trip);
    } catch (error) {
      res.status(500).json({ message: "Failed to start trip" });
    }
  });

  app.post("/api/trips/:id/end", authenticateToken, async (req: any, res) => {
    try {
      const { lat, lng } = req.body;
      const parsedLat = lat ? parseFloat(lat) : null;
      const parsedLng = lng ? parseFloat(lng) : null;
      const updated = await storage.updateTrip(req.params.id, {
        endTime: new Date(),
        endLat: parsedLat !== null ? String(parsedLat) : null,
        endLng: parsedLng !== null ? String(parsedLng) : null,
        status: "completed",
      });
      if (!updated) return res.status(404).json({ message: "Trip not found" });
      if (parsedLat !== null && parsedLng !== null) {
        await storage.createLocationLog({
          employeeId: updated.employeeId, tripId: updated.id,
          lat: String(parsedLat), lng: String(parsedLng),
          timestamp: new Date(), tripActive: false,
        });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to end trip" });
    }
  });

  app.post("/api/trips/:id/log", authenticateToken, async (req: any, res) => {
    try {
      const { lat, lng, employeeId } = req.body;
      const parsedLat = parseFloat(lat); const parsedLng = parseFloat(lng);
      if (isNaN(parsedLat) || isNaN(parsedLng) || !employeeId) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const created = await storage.createLocationLog({
        employeeId, tripId: req.params.id, lat: String(parsedLat), lng: String(parsedLng),
        timestamp: new Date(), tripActive: true,
      });
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to log location" });
    }
  });

  app.post("/api/employees/:id/generate-qr", authenticateToken, async (req: any, res) => {
    try {
      const employee = (await storage.getEmployees()).find(e => e.id === req.params.id);
      if (!employee) return res.status(404).json({ message: "Employee not found" });

      const qrCode = `NEXERP-EMP-${employee.id}`;
      await storage.updateEmployee(employee.id, { qrCode });

      const qrDataUrl = await QRCode.toDataURL(qrCode, { width: 300, margin: 2 });
      res.json({ qrCode, qrDataUrl, employeeName: employee.name });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate QR code" });
    }
  });

  app.post("/api/employees/generate-all-qr", authenticateToken, async (req: any, res) => {
    try {
      const employees = await storage.getEmployees();
      const results = [];
      for (const emp of employees) {
        if (!emp.qrCode) {
          const qrCode = `NEXERP-EMP-${emp.id}`;
          await storage.updateEmployee(emp.id, { qrCode });
          results.push({ id: emp.id, name: emp.name, qrCode });
        } else {
          results.push({ id: emp.id, name: emp.name, qrCode: emp.qrCode });
        }
      }
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate QR codes" });
    }
  });

  app.get("/api/employees/:id/qr-image", async (req, res) => {
    try {
      const employee = (await storage.getEmployees()).find(e => e.id === req.params.id);
      if (!employee || !employee.qrCode) return res.status(404).json({ message: "QR code not found" });

      const qrDataUrl = await QRCode.toDataURL(employee.qrCode, { width: 400, margin: 2 });
      res.json({ qrDataUrl, qrCode: employee.qrCode, employeeName: employee.name });
    } catch (error) {
      res.status(500).json({ message: "Failed to get QR image" });
    }
  });

  return httpServer;
}
