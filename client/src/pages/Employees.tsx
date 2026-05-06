import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Users, CalendarCheck, MapPin, UserCheck, Pencil, Trash2, QrCode, Download, Wallet, ChevronLeft, ChevronRight, Eye, Mail, Globe, CheckCircle2, ShieldCheck, ShieldOff, KeyRound, ChevronDown, ChevronUp, CalendarOff, Check, X, CreditCard, AlarmClock, FileText, IndianRupee, TrendingUp, AlertCircle } from "lucide-react";
import EmployeeIdCard from "@/components/EmployeeIdCard";
import { downloadIdCardPDF } from "@/lib/id-card-pdf";
import { downloadPayslipPDF } from "@/lib/payslip-pdf";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { Employee, AttendanceRecord, PayrollStatus, LeaveRequest, LateArrivalRequest, EmployeeAdvance, EmployeeIncentive } from "@shared/schema";

type UserAccount = { id: string; username: string; role: string };

export default function Employees() {
  const { toast } = useToast();
  const { data: employees, isLoading: empLoading } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: attendance, isLoading: attLoading } = useQuery<AttendanceRecord[]>({ queryKey: ["/api/attendance"] });
  const { data: users } = useQuery<UserAccount[]>({ queryKey: ["/api/users"] });

  const activeCount = employees?.filter((e) => e.isActive).length ?? 0;

  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get("tab") || "employees";
  const [activeTab, setActiveTab] = useState(initialTab);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", department: "Sales", designation: "", salary: "", isActive: true });

  const [showPortalSection, setShowPortalSection] = useState(false);
  const [portalForm, setPortalForm] = useState({ username: "", password: "", role: "field_staff" });

  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrData, setQrData] = useState<{ qrDataUrl: string; employeeName: string; qrCode: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [idCardDialogOpen, setIdCardDialogOpen] = useState(false);
  const [idCardEmployee, setIdCardEmployee] = useState<Employee | null>(null);

  const now = new Date();
  const [payrollMonth, setPayrollMonth] = useState(now.getMonth());
  const [payrollYear, setPayrollYear] = useState(now.getFullYear());
  const [payslipEmployee, setPayslipEmployee] = useState<Employee | null>(null);
  const [payslipOpen, setPayslipOpen] = useState(false);
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ employeeId: "", amount: "", dateGiven: new Date().toISOString().slice(0, 10), reason: "" });
  const [advanceEmployeeFilter, setAdvanceEmployeeFilter] = useState("all");
  const [advanceStatusFilter, setAdvanceStatusFilter] = useState("all");
  const [incentiveDialogOpen, setIncentiveDialogOpen] = useState(false);
  const [incentiveForm, setIncentiveForm] = useState({ employeeId: "", amount: "", dateGiven: new Date().toISOString().slice(0, 10), reason: "" });
  const [incentiveEmployeeFilter, setIncentiveEmployeeFilter] = useState("all");
  const [incentiveStatusFilter, setIncentiveStatusFilter] = useState("all");
  const [csvFromMonth, setCsvFromMonth] = useState(new Date().getMonth());
  const [csvFromYear, setCsvFromYear] = useState(new Date().getFullYear());
  const [csvToMonth, setCsvToMonth] = useState(new Date().getMonth());
  const [csvToYear, setCsvToYear] = useState(new Date().getFullYear());
  const [csvPopoverOpen, setCsvPopoverOpen] = useState(false);

  const { data: payrollStatusData, isLoading: psLoading } = useQuery<PayrollStatus | null>({
    queryKey: ["/api/payroll-status", payrollMonth, payrollYear],
  });

  const { data: advances = [] } = useQuery<EmployeeAdvance[]>({
    queryKey: ["/api/employee-advances"],
  });

  const { data: incentives = [] } = useQuery<EmployeeIncentive[]>({
    queryKey: ["/api/employee-incentives"],
  });

  const { data: allLeaveRequests = [], isLoading: lrLoading } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave-requests"],
  });
  const [leaveSubTab, setLeaveSubTab] = useState<"pending" | "history">("pending");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingLeaveId, setRejectingLeaveId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [leaveEmployeeFilter, setLeaveEmployeeFilter] = useState("all");
  const [leaveMonthFilter, setLeaveMonthFilter] = useState("all");

  const approveLeaveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/leave-requests/${id}/approve`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({ title: "Leave approved" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rejectLeaveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/leave-requests/${rejectingLeaveId}/reject`, { reviewNote: rejectNote });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({ title: "Leave rejected" });
      setRejectDialogOpen(false);
      setRejectingLeaveId(null);
      setRejectNote("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const leaveTypeLabel: Record<string, string> = { annual: "Annual", sick: "Sick", casual: "Casual", unpaid: "Unpaid" };

  // ——— Late Arrival Requests ———
  const { data: allLateArrivalRequests = [], isLoading: larLoading } = useQuery<LateArrivalRequest[]>({
    queryKey: ["/api/late-arrival-requests"],
  });
  const [larSubTab, setLarSubTab] = useState<"pending" | "history">("pending");
  const [larEmployeeFilter, setLarEmployeeFilter] = useState("all");
  const [rejectLarDialogOpen, setRejectLarDialogOpen] = useState(false);
  const [rejectingLarId, setRejectingLarId] = useState<string | null>(null);
  const [rejectLarNote, setRejectLarNote] = useState("");

  const approveLarMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/late-arrival-requests/${id}/approve`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/late-arrival-requests"] });
      toast({ title: "Late arrival approved" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rejectLarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/late-arrival-requests/${rejectingLarId}/reject`, { reviewNote: rejectLarNote });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/late-arrival-requests"] });
      toast({ title: "Late arrival request rejected" });
      setRejectLarDialogOpen(false);
      setRejectingLarId(null);
      setRejectLarNote("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const getLeaveBalance = (empId: string) => {
    const year = new Date().getFullYear();
    const approved = allLeaveRequests.filter(lr => lr.employeeId === empId && lr.status === "approved" && new Date(lr.startDate).getFullYear() === year);
    const used: Record<string, number> = { annual: 0, sick: 0, casual: 0, unpaid: 0 };
    for (const lr of approved) {
      const days = Math.round((new Date(lr.endDate).getTime() - new Date(lr.startDate).getTime()) / 86400000) + 1;
      used[lr.type] = (used[lr.type] || 0) + days;
    }
    return {
      annual: { total: 12, used: used.annual, remaining: Math.max(0, 12 - used.annual) },
      sick: { total: 6, used: used.sick, remaining: Math.max(0, 6 - used.sick) },
      casual: { total: 6, used: used.casual, remaining: Math.max(0, 6 - used.casual) },
    };
  };

  const disburseMutation = useMutation({
    mutationFn: async () => {
      const totalNet = employees?.filter(e => e.isActive).reduce((sum, emp) => sum + getPayrollData(emp).netPay, 0) || 0;
      let ps = payrollStatusData;
      if (!ps) {
        const res = await apiRequest("POST", "/api/payroll-status", { month: payrollMonth, year: payrollYear, totalAmount: String(totalNet) });
        ps = await res.json();
      }
      if (ps && ps.id) {
        await apiRequest("PATCH", `/api/payroll-status/${ps.id}/disburse`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-advances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-incentives"] });
      toast({ title: "Payroll disbursed", description: `${monthNames[payrollMonth]} ${payrollYear} payroll marked as disbursed.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async () => {
      if (!advanceForm.employeeId || !advanceForm.amount || Number(advanceForm.amount) <= 0) {
        throw new Error("Employee and a valid amount are required.");
      }
      const res = await apiRequest("POST", "/api/employee-advances", {
        employeeId: advanceForm.employeeId,
        amount: advanceForm.amount,
        dateGiven: advanceForm.dateGiven,
        reason: advanceForm.reason || undefined,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to record advance"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-advances"] });
      toast({ title: "Advance recorded", description: "Advance payment will be deducted from next payroll." });
      setAdvanceDialogOpen(false);
      setAdvanceForm({ employeeId: "", amount: "", dateGiven: new Date().toISOString().slice(0, 10), reason: "" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const incentiveMutation = useMutation({
    mutationFn: async () => {
      if (!incentiveForm.employeeId || !incentiveForm.amount || Number(incentiveForm.amount) <= 0) {
        throw new Error("Employee and a valid amount are required.");
      }
      const res = await apiRequest("POST", "/api/employee-incentives", {
        employeeId: incentiveForm.employeeId,
        amount: incentiveForm.amount,
        dateGiven: incentiveForm.dateGiven,
        reason: incentiveForm.reason || undefined,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to record incentive"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-incentives"] });
      toast({ title: "Incentive recorded", description: "Incentive will be added to the employee's next payroll disbursement." });
      setIncentiveDialogOpen(false);
      setIncentiveForm({ employeeId: "", amount: "", dateGiven: new Date().toISOString().slice(0, 10), reason: "" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const getLinkedUser = (emp: Employee): UserAccount | undefined => {
    return emp.userId ? users?.find(u => u.id === emp.userId) : undefined;
  };

  const employeeMutation = useMutation({
    mutationFn: async (data: any) => {
      const { username, password, role: accountRole, ...empData } = data;
      if (editingEmployee) {
        await apiRequest("PATCH", `/api/employees/${editingEmployee.id}`, empData);
        if (showPortalSection && username) {
          const res = await apiRequest("PATCH", `/api/employees/${editingEmployee.id}/account`, { username, password: password || undefined, role: accountRole });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || "Failed to update account");
          }
        }
      } else {
        const payload: any = { ...empData };
        if (showPortalSection && username && password) {
          payload.username = username;
          payload.password = password;
          payload.role = accountRole;
        }
        const res = await apiRequest("POST", "/api/employees", payload);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Failed to create employee");
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: editingEmployee ? "Employee updated" : "Employee added" });
      setDialogOpen(false);
      setEditingEmployee(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/employees/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "Employee deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openNew = () => {
    setEditingEmployee(null);
    const emptyForm = { name: "", email: "", phone: "", company: "", department: "Sales", designation: "", salary: "", isActive: true };
    setForm(emptyForm);
    setShowPortalSection(false);
    setPortalForm({ username: "", password: "", role: "field_staff" });
    setDialogOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setForm({
      name: emp.name,
      email: emp.email,
      phone: emp.phone || "",
      company: emp.company || "",
      department: emp.department,
      designation: emp.designation,
      salary: emp.salary ? String(emp.salary) : "",
      isActive: emp.isActive,
    });
    const linkedUser = getLinkedUser(emp);
    if (linkedUser) {
      setShowPortalSection(true);
      setPortalForm({ username: linkedUser.username, password: "", role: linkedUser.role });
    } else {
      setShowPortalSection(false);
      setPortalForm({ username: emp.email || "", password: "", role: "field_staff" });
    }
    setDialogOpen(true);
  };

  const generateQr = async (empId: string) => {
    setQrLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/employees/${empId}/generate-qr`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to generate QR");
      const data = await res.json();
      setQrData(data);
      setQrDialogOpen(true);
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
    } catch {
      toast({ title: "Error", description: "Failed to generate QR code", variant: "destructive" });
    } finally {
      setQrLoading(false);
    }
  };

  const viewQr = async (empId: string) => {
    try {
      const res = await fetch(`/api/employees/${empId}/qr-image`);
      if (!res.ok) throw new Error("QR not found");
      const data = await res.json();
      setQrData(data);
      setQrDialogOpen(true);
    } catch {
      toast({ title: "Error", description: "QR code not found. Generate one first.", variant: "destructive" });
    }
  };

  const generateAllQr = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/employees/generate-all-qr", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "QR codes generated for all employees" });
    } catch {
      toast({ title: "Error", description: "Failed to generate QR codes", variant: "destructive" });
    }
  };

  const downloadQr = () => {
    if (!qrData) return;
    const link = document.createElement("a");
    link.href = qrData.qrDataUrl;
    link.download = `QR-${qrData.employeeName.replace(/\s+/g, "-")}.png`;
    link.click();
  };

  const openIdCard = (emp: Employee) => {
    setIdCardEmployee(emp);
    setIdCardDialogOpen(true);
  };

  const getEmployeeName = (empId: string) => {
    return employees?.find(e => e.id === empId)?.name || "Unknown";
  };

  const todayStr = new Date().toLocaleDateString();
  const todayAttendance = attendance?.filter(a => {
    const d = new Date(a.date);
    return d.toLocaleDateString() === todayStr;
  }) || [];

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const getWorkingDaysInMonth = (month: number, year: number) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let workingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d).getDay();
      if (day !== 0) workingDays++;
    }
    return workingDays;
  };

  const getPayrollData = (emp: Employee) => {
    const monthlySalary = emp.salary ? Number(emp.salary) : 0;
    const dailyRate = Math.round(monthlySalary / 26);
    const empAttendance = attendance?.filter(a => {
      const d = new Date(a.date);
      return a.employeeId === emp.id && d.getMonth() === payrollMonth && d.getFullYear() === payrollYear;
    }) || [];
    const fullDays = empAttendance.filter(a => a.status === "present").length;
    const halfDays = empAttendance.filter(a => a.status === "half_day").length;
    const workingDays = getWorkingDaysInMonth(payrollMonth, payrollYear);
    const daysAbsent = Math.max(0, workingDays - fullDays - halfDays);
    const earnedSalary = (fullDays * dailyRate) + (halfDays * Math.round(dailyRate / 2));
    const deductions = monthlySalary - earnedSalary;

    // Incentive: sum of all unapplied incentives for this employee (event-based, not static)
    const empPendingIncentives = incentives.filter(i => i.employeeId === emp.id && !i.isApplied);
    const incentiveAmt = empPendingIncentives.reduce((s, i) => s + Number(i.amount), 0);
    const incentiveDates = empPendingIncentives.map(i => new Date(i.dateGiven).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));

    // Advance deduction: all undeducted advances for this employee regardless of month
    const empPendingAdvances = advances.filter(a => a.employeeId === emp.id && !a.isDeducted);
    const totalAdvancePending = empPendingAdvances.reduce((s, a) => s + Number(a.amount), 0);
    const grossBeforeAdv = earnedSalary + incentiveAmt;
    const advanceDeduct = Math.min(totalAdvancePending, grossBeforeAdv);
    const unrecoveredAdvance = totalAdvancePending - advanceDeduct;
    const advanceDates = empPendingAdvances.map(a => new Date(a.dateGiven).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));

    const netPay = Math.max(0, grossBeforeAdv - advanceDeduct);
    return { monthlySalary, dailyRate, fullDays, halfDays, daysAbsent, workingDays, earnedSalary, deductions, incentiveAmt, incentiveDates, advanceDeduct, unrecoveredAdvance, advanceDates, netPay };
  };

  const prevMonth = () => {
    if (payrollMonth === 0) { setPayrollMonth(11); setPayrollYear(payrollYear - 1); }
    else setPayrollMonth(payrollMonth - 1);
  };
  const nextMonth = () => {
    if (payrollMonth === 11) { setPayrollMonth(0); setPayrollYear(payrollYear + 1); }
    else setPayrollMonth(payrollMonth + 1);
  };

  const downloadPayrollCSV = () => {
    const activeEmployees = employees?.filter(e => e.isActive) || [];
    const rows: string[][] = [];
    rows.push(["Employee", "Department", "Company", "Month", "Year", "Gross Salary", "Daily Rate", "Full Days", "Half Days", "Absent", "Earned Salary", "Incentive Amount", "Advance Deduction", "Attendance Deduction", "Net Pay"]);

    const fromIdx = csvFromYear * 12 + csvFromMonth;
    const toIdx = csvToYear * 12 + csvToMonth;

    for (let idx = fromIdx; idx <= toIdx; idx++) {
      const m = idx % 12;
      const y = Math.floor(idx / 12);
      for (const emp of activeEmployees) {
        const monthlySalary = emp.salary ? Number(emp.salary) : 0;
        const dailyRate = Math.round(monthlySalary / 26);
        const empAtt = attendance?.filter(a => {
          const d = new Date(a.date);
          return a.employeeId === emp.id && d.getMonth() === m && d.getFullYear() === y;
        }) || [];
        const fullDays = empAtt.filter(a => a.status === "present").length;
        const halfDays = empAtt.filter(a => a.status === "half_day").length;
        const workingDays = getWorkingDaysInMonth(m, y);
        const daysAbsent = Math.max(0, workingDays - fullDays - halfDays);
        const earnedSalary = fullDays * dailyRate + halfDays * Math.round(dailyRate / 2);
        const attDeduction = monthlySalary - earnedSalary;
        const empIncentivesThisMonth = incentives.filter(i => {
          const d = new Date(i.dateGiven);
          return i.employeeId === emp.id && d.getMonth() === m && d.getFullYear() === y;
        });
        const incentiveAmt = empIncentivesThisMonth.reduce((s, i) => s + Number(i.amount), 0);
        const empPending = advances.filter(a => a.employeeId === emp.id && !a.isDeducted);
        const totalAdv = empPending.reduce((s, a) => s + Number(a.amount), 0);
        const advDeduct = Math.min(totalAdv, earnedSalary + incentiveAmt);
        const netPay = Math.max(0, earnedSalary + incentiveAmt - advDeduct);
        rows.push([
          emp.name, emp.department, emp.company || "", monthNames[m], String(y),
          String(monthlySalary), String(dailyRate),
          String(fullDays), String(halfDays), String(daysAbsent),
          String(earnedSalary),
          String(incentiveAmt),
          String(advDeduct),
          String(attDeduction),
          String(netPay),
        ]);
      }
    }

    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Payroll-${monthNames[csvFromMonth]}-${csvFromYear}-to-${monthNames[csvToMonth]}-${csvToYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setCsvPopoverOpen(false);
  };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Employee Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage staff, attendance, and payroll</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={generateAllQr} data-testid="button-generate-all-qr">
            <QrCode className="w-4 h-4 mr-2" />
            Generate All QR Codes
          </Button>
          <Button data-testid="button-add-employee" onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            Add Employee
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{employees?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Staff</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-today-attendance">{todayAttendance.length}</p>
              <p className="text-xs text-muted-foreground">Present Today</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{attendance?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Records</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="employees" data-testid="tab-employees">Employees</TabsTrigger>
          <TabsTrigger value="attendance" data-testid="tab-attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payroll" data-testid="tab-payroll">Payroll</TabsTrigger>
          <TabsTrigger value="leave" data-testid="tab-leave" className="relative">
            Leave Requests
            {allLeaveRequests.filter(lr => lr.status === "pending").length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {allLeaveRequests.filter(lr => lr.status === "pending").length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="late_arrivals" data-testid="tab-late-arrivals" className="relative">
            Late Arrivals
            {allLateArrivalRequests.filter(r => r.status === "pending").length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {allLateArrivalRequests.filter(r => r.status === "pending").length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search employees..." className="pl-9" data-testid="input-search-employees" />
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Employee</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Department</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Designation</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Phone</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Company</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Monthly Salary</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Daily Rate</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">QR Code</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Portal Access</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 10 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                          ))}
                        </tr>
                      ))
                    ) : employees && employees.length > 0 ? (
                      employees.map((emp) => (
                        <tr key={emp.id} className="border-b last:border-0" data-testid={`row-employee-${emp.id}`}>
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className="text-xs">{emp.name.charAt(0).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{emp.name}</p>
                                <p className="text-xs text-muted-foreground">{emp.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">{emp.department}</td>
                          <td className="p-3 text-muted-foreground">{emp.designation}</td>
                          <td className="p-3 text-muted-foreground">{emp.phone || "\u2014"}</td>
                          <td className="p-3 text-muted-foreground">{emp.company || "\u2014"}</td>
                          <td className="p-3 text-right font-medium" data-testid={`text-salary-${emp.id}`}>{emp.salary ? `\u20B9${Number(emp.salary).toLocaleString("en-IN")}` : "\u2014"}</td>
                          <td className="p-3 text-right text-muted-foreground" data-testid={`text-daily-rate-${emp.id}`}>{emp.salary ? `\u20B9${Math.round(Number(emp.salary) / 26).toLocaleString("en-IN")}` : "\u2014"}</td>
                          <td className="p-3">
                            {emp.qrCode ? (
                              <Button size="sm" variant="outline" onClick={() => viewQr(emp.id)} data-testid={`button-view-qr-${emp.id}`}>
                                <QrCode className="w-3 h-3 mr-1" />
                                View
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => generateQr(emp.id)} disabled={qrLoading} data-testid={`button-gen-qr-${emp.id}`}>
                                <QrCode className="w-3 h-3 mr-1" />
                                Generate
                              </Button>
                            )}
                          </td>
                          <td className="p-3" data-testid={`cell-portal-access-${emp.id}`}>
                            {emp.userId ? (
                              <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-400 gap-1 no-default-hover-elevate no-default-active-elevate">
                                <ShieldCheck className="w-3 h-3" />
                                Has Login Access
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-muted text-muted-foreground gap-1 no-default-hover-elevate no-default-active-elevate">
                                <ShieldOff className="w-3 h-3" />
                                No Access
                              </Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge variant={emp.isActive ? "default" : "secondary"}>
                              {emp.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {emp.qrCode && (
                                <Button size="icon" variant="ghost" title="View ID Card" data-testid={`button-id-card-${emp.id}`} onClick={() => openIdCard(emp)}>
                                  <CreditCard className="w-4 h-4" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" data-testid={`button-edit-employee-${emp.id}`} onClick={() => openEdit(emp)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" data-testid={`button-delete-employee-${emp.id}`} onClick={() => { if (confirm("Delete this employee?")) deleteMutation.mutate(emp.id); }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-muted-foreground">No employees found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Employee</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Check In</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Lunch Out</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Lunch In</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Tea Out</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Tea In</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Field Out</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Field In</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Check Out</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Break Time</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Location</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attLoading ? (
                      <tr><td colSpan={13} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : attendance && attendance.length > 0 ? (
                      attendance.map((a) => {
                        const formatTime = (t: Date | string | null | undefined) => t ? new Date(t as string).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "\u2014";
                        let totalBreakMins = 0;
                        if (a.lunchOut && a.lunchIn) totalBreakMins += Math.round((new Date(a.lunchIn).getTime() - new Date(a.lunchOut).getTime()) / 60000);
                        if (a.teaOut && a.teaIn) totalBreakMins += Math.round((new Date(a.teaIn).getTime() - new Date(a.teaOut).getTime()) / 60000);
                        if (a.fieldVisitOut && a.fieldVisitIn) totalBreakMins += Math.round((new Date(a.fieldVisitIn).getTime() - new Date(a.fieldVisitOut).getTime()) / 60000);
                        return (
                          <tr key={a.id} className="border-b last:border-0" data-testid={`row-attendance-${a.id}`}>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-6 h-6">
                                  <AvatarFallback className="text-[10px]">{getEmployeeName(a.employeeId).charAt(0)}</AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{getEmployeeName(a.employeeId)}</span>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground">{new Date(a.date).toLocaleDateString("en-IN")}</td>
                            <td className="p-3">{formatTime(a.checkIn)}</td>
                            <td className="p-3 text-orange-600">{formatTime(a.lunchOut)}</td>
                            <td className="p-3 text-orange-600">{formatTime(a.lunchIn)}</td>
                            <td className="p-3 text-purple-600">{formatTime(a.teaOut)}</td>
                            <td className="p-3 text-purple-600">{formatTime(a.teaIn)}</td>
                            <td className="p-3 text-teal-600">{formatTime(a.fieldVisitOut)}</td>
                            <td className="p-3 text-teal-600">{formatTime(a.fieldVisitIn)}</td>
                            <td className="p-3">{formatTime(a.checkOut)}</td>
                            <td className="p-3">
                              {totalBreakMins > 0 ? (
                                <span className="text-muted-foreground">{totalBreakMins} min</span>
                              ) : (
                                <span className="text-muted-foreground">\u2014</span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className="text-xs text-muted-foreground max-w-[200px] truncate block" title={a.location || ""}>
                                {a.location || "\u2014"}
                              </span>
                            </td>
                            <td className="p-3">
                              <Badge data-testid={`badge-status-${a.id}`} variant={a.status === "present" ? "default" : a.status === "half_day" ? "outline" : "secondary"} className={a.status === "half_day" ? "border-amber-500 text-amber-600 dark:text-amber-400" : ""}>
                                {a.status === "half_day" ? "Half Day" : a.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={13} className="p-8 text-center text-muted-foreground">
                          <CalendarCheck className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                          <p>No attendance records yet.</p>
                          <p className="text-xs mt-1">Attendance will appear here when employees use the Kiosk system.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Button size="icon" variant="outline" onClick={prevMonth} data-testid="button-prev-month">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h2 className="text-lg font-semibold min-w-[180px] text-center" data-testid="text-payroll-month">
                {monthNames[payrollMonth]} {payrollYear}
              </h2>
              <Button size="icon" variant="outline" onClick={nextMonth} data-testid="button-next-month">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="w-4 h-4" />
                <span>Working Days: <strong className="text-foreground">{getWorkingDaysInMonth(payrollMonth, payrollYear)}</strong></span>
              </div>
              {/* CSV Export popover */}
              <div className="relative">
                <Button variant="outline" size="sm" onClick={() => setCsvPopoverOpen(v => !v)} data-testid="button-csv-payroll">
                  <Download className="w-4 h-4 mr-1" />
                  Download CSV
                </Button>
                {csvPopoverOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg p-4 w-72 space-y-3">
                    <p className="text-sm font-semibold">Export Month Range</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">From Month</Label>
                        <Select value={String(csvFromMonth)} onValueChange={v => setCsvFromMonth(Number(v))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{monthNames.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">From Year</Label>
                        <Input type="number" className="h-8 text-xs" value={csvFromYear} onChange={e => setCsvFromYear(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">To Month</Label>
                        <Select value={String(csvToMonth)} onValueChange={v => setCsvToMonth(Number(v))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{monthNames.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">To Year</Label>
                        <Input type="number" className="h-8 text-xs" value={csvToYear} onChange={e => setCsvToYear(Number(e.target.value))} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={downloadPayrollCSV} data-testid="button-confirm-csv">Export</Button>
                      <Button size="sm" variant="outline" onClick={() => setCsvPopoverOpen(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setAdvanceDialogOpen(true)} data-testid="button-record-advance">
                <IndianRupee className="w-4 h-4 mr-1" />
                Record Advance
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIncentiveDialogOpen(true)} className="border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20" data-testid="button-record-incentive">
                <TrendingUp className="w-4 h-4 mr-1" />
                Record Incentive
              </Button>
              {payrollStatusData?.status === "disbursed" ? (
                <Badge variant="outline" className="border-emerald-500 text-emerald-600 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate" data-testid="badge-payroll-disbursed">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Disbursed
                </Badge>
              ) : (
                <Button variant="default" size="sm" onClick={() => disburseMutation.mutate()} disabled={disburseMutation.isPending} data-testid="button-disburse-payroll">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  {disburseMutation.isPending ? "Processing..." : "Mark as Disbursed"}
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Employee</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Company</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Gross Salary</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Daily Rate</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Full Days</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Half Days</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Absent</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Earned</th>
                      <th className="text-right p-3 font-medium text-emerald-600">Incentive</th>
                      <th className="text-right p-3 font-medium text-red-500">Advance</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Net Pay</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Payslip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 12 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-16" /></td>
                          ))}
                        </tr>
                      ))
                    ) : employees && employees.filter(e => e.isActive).length > 0 ? (
                      employees.filter(e => e.isActive).map((emp) => {
                        const p = getPayrollData(emp);
                        return (
                          <tr key={emp.id} className="border-b last:border-0" data-testid={`row-payroll-${emp.id}`}>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-7 h-7">
                                  <AvatarFallback className="text-xs">{emp.name.charAt(0).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium">{emp.name}</p>
                                  <p className="text-xs text-muted-foreground">{emp.department}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">{emp.company || "\u2014"}</td>
                            <td className="p-3 text-right" data-testid={`text-payroll-salary-${emp.id}`}>{"\u20B9"}{p.monthlySalary.toLocaleString("en-IN")}</td>
                            <td className="p-3 text-right text-muted-foreground">{"\u20B9"}{p.dailyRate.toLocaleString("en-IN")}</td>
                            <td className="p-3 text-center">
                              <Badge variant="default" className="no-default-hover-elevate no-default-active-elevate">{p.fullDays}</Badge>
                            </td>
                            <td className="p-3 text-center">
                              {p.halfDays > 0 ? (
                                <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 no-default-hover-elevate no-default-active-elevate">{p.halfDays}</Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {p.daysAbsent > 0 ? (
                                <Badge variant="outline" className="border-red-500 text-red-600 dark:text-red-400 no-default-hover-elevate no-default-active-elevate">{p.daysAbsent}</Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400" data-testid={`text-payroll-earned-${emp.id}`}>{"\u20B9"}{p.earnedSalary.toLocaleString("en-IN")}</td>
                            <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 text-xs" data-testid={`text-payroll-incentive-${emp.id}`}>
                              {p.incentiveAmt > 0 ? `+\u20B9${p.incentiveAmt.toLocaleString("en-IN")}` : <span className="text-muted-foreground">\u2014</span>}
                            </td>
                            <td className="p-3 text-right text-red-600 dark:text-red-400 text-xs" data-testid={`text-payroll-advance-${emp.id}`}>
                              {p.advanceDeduct > 0 ? `-\u20B9${p.advanceDeduct.toLocaleString("en-IN")}` : <span className="text-muted-foreground">\u2014</span>}
                            </td>
                            <td className="p-3 text-right font-bold" data-testid={`text-payroll-net-${emp.id}`}>{"\u20B9"}{p.netPay.toLocaleString("en-IN")}</td>
                            <td className="p-3 text-center">
                              <Button size="icon" variant="ghost" data-testid={`button-payslip-${emp.id}`} onClick={() => { setPayslipEmployee(emp); setPayslipOpen(true); }}>
                                <Eye className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={12} className="p-8 text-center text-muted-foreground">
                          <Wallet className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                          <p>No active employees found.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {employees && employees.filter(e => e.isActive).length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 bg-muted/30">
                        <td colSpan={7} className="p-3 font-semibold text-right">Total Payroll:</td>
                        <td className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400" data-testid="text-total-earned">
                          {"\u20B9"}{employees.filter(e => e.isActive).reduce((sum, emp) => sum + getPayrollData(emp).earnedSalary, 0).toLocaleString("en-IN")}
                        </td>
                        <td className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {"\u20B9"}{employees.filter(e => e.isActive).reduce((sum, emp) => sum + getPayrollData(emp).incentiveAmt, 0).toLocaleString("en-IN")}
                        </td>
                        <td className="p-3 text-right font-semibold text-red-600 dark:text-red-400">
                          {"\u20B9"}{employees.filter(e => e.isActive).reduce((sum, emp) => sum + getPayrollData(emp).advanceDeduct, 0).toLocaleString("en-IN")}
                        </td>
                        <td className="p-3 text-right font-bold text-lg" data-testid="text-total-net">
                          {"\u20B9"}{employees.filter(e => e.isActive).reduce((sum, emp) => sum + getPayrollData(emp).netPay, 0).toLocaleString("en-IN")}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Advances sub-section */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-amber-500" />
                  Advance Payments
                  {advances.filter(a => !a.isDeducted).length > 0 && (
                    <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs no-default-hover-elevate no-default-active-elevate">
                      {advances.filter(a => !a.isDeducted).length} Pending
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Select value={advanceEmployeeFilter} onValueChange={setAdvanceEmployeeFilter}>
                    <SelectTrigger className="w-40 h-8 text-xs" data-testid="select-advance-employee-filter"><SelectValue placeholder="All Employees" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employees?.filter(e => e.isActive).map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={advanceStatusFilter} onValueChange={setAdvanceStatusFilter}>
                    <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-advance-status-filter"><SelectValue placeholder="All Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="deducted">Deducted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(() => {
                const filtered = advances.filter(a => {
                  if (advanceEmployeeFilter !== "all" && a.employeeId !== advanceEmployeeFilter) return false;
                  if (advanceStatusFilter === "pending" && a.isDeducted) return false;
                  if (advanceStatusFilter === "deducted" && !a.isDeducted) return false;
                  return true;
                });
                if (filtered.length === 0) {
                  return (
                    <div className="p-8 text-center text-muted-foreground">
                      <IndianRupee className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                      <p className="text-sm">No advance payments recorded.</p>
                    </div>
                  );
                }
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-medium text-muted-foreground">Employee</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Date Given</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Reason</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(adv => (
                          <tr key={adv.id} className="border-b last:border-0" data-testid={`row-advance-${adv.id}`}>
                            <td className="p-3 font-medium">{employees?.find(e => e.id === adv.employeeId)?.name || "—"}</td>
                            <td className="p-3 text-muted-foreground">{new Date(adv.dateGiven).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                            <td className="p-3 text-right font-semibold">{"\u20B9"}{Number(adv.amount).toLocaleString("en-IN")}</td>
                            <td className="p-3 text-muted-foreground text-xs">{adv.reason || "—"}</td>
                            <td className="p-3 text-center">
                              {adv.isDeducted ? (
                                <Badge variant="outline" className="border-emerald-500 text-emerald-600 dark:text-emerald-400 text-xs no-default-hover-elevate no-default-active-elevate">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Deducted
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 text-xs no-default-hover-elevate no-default-active-elevate">
                                  <AlertCircle className="w-3 h-3 mr-1" /> Pending
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Incentives sub-section */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  Incentive / Bonus Payments
                  {incentives.filter(i => !i.isApplied).length > 0 && (
                    <Badge variant="outline" className="border-emerald-500 text-emerald-600 text-xs no-default-hover-elevate no-default-active-elevate">
                      {incentives.filter(i => !i.isApplied).length} Pending
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Select value={incentiveEmployeeFilter} onValueChange={setIncentiveEmployeeFilter}>
                    <SelectTrigger className="w-40 h-8 text-xs" data-testid="select-incentive-employee-filter"><SelectValue placeholder="All Employees" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employees?.filter(e => e.isActive).map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={incentiveStatusFilter} onValueChange={setIncentiveStatusFilter}>
                    <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-incentive-status-filter"><SelectValue placeholder="All Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="applied">Applied</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(() => {
                const filtered = incentives.filter(i => {
                  if (incentiveEmployeeFilter !== "all" && i.employeeId !== incentiveEmployeeFilter) return false;
                  if (incentiveStatusFilter === "pending" && i.isApplied) return false;
                  if (incentiveStatusFilter === "applied" && !i.isApplied) return false;
                  return true;
                });
                if (filtered.length === 0) {
                  return (
                    <div className="p-8 text-center text-muted-foreground">
                      <TrendingUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                      <p className="text-sm">No incentives recorded.</p>
                    </div>
                  );
                }
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-medium text-muted-foreground">Employee</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Date Given</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Reason</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(inc => (
                          <tr key={inc.id} className="border-b last:border-0" data-testid={`row-incentive-${inc.id}`}>
                            <td className="p-3 font-medium">{employees?.find(e => e.id === inc.employeeId)?.name || "—"}</td>
                            <td className="p-3 text-muted-foreground">{new Date(inc.dateGiven).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                            <td className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{"\u20B9"}{Number(inc.amount).toLocaleString("en-IN")}</td>
                            <td className="p-3 text-muted-foreground text-xs">{inc.reason || "—"}</td>
                            <td className="p-3 text-center">
                              {inc.isApplied ? (
                                <Badge variant="outline" className="border-emerald-500 text-emerald-600 dark:text-emerald-400 text-xs no-default-hover-elevate no-default-active-elevate">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Applied
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 text-xs no-default-hover-elevate no-default-active-elevate">
                                  <AlertCircle className="w-3 h-3 mr-1" /> Pending
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex rounded-lg border overflow-hidden">
              <button
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${leaveSubTab === "pending" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
                onClick={() => setLeaveSubTab("pending")}
                data-testid="button-leave-pending-tab"
              >
                Pending {allLeaveRequests.filter(lr => lr.status === "pending").length > 0 && `(${allLeaveRequests.filter(lr => lr.status === "pending").length})`}
              </button>
              <button
                className={`px-4 py-1.5 text-sm font-medium transition-colors border-l ${leaveSubTab === "history" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
                onClick={() => setLeaveSubTab("history")}
                data-testid="button-leave-history-tab"
              >
                History
              </button>
            </div>
            <Select value={leaveEmployeeFilter} onValueChange={setLeaveEmployeeFilter}>
              <SelectTrigger className="w-48" data-testid="select-leave-employee-filter">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees?.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {leaveSubTab === "history" && (
              <Select value={leaveMonthFilter} onValueChange={setLeaveMonthFilter}>
                <SelectTrigger className="w-44" data-testid="select-leave-month-filter">
                  <SelectValue placeholder="All Months" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {monthNames.map((m, i) => (
                    <SelectItem key={i} value={String(i)}>{m} {new Date().getFullYear()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {leaveSubTab === "pending" && (
            <Card>
              <CardContent className="p-0">
                {lrLoading ? (
                  <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : (() => {
                  const rows = allLeaveRequests.filter(lr => lr.status === "pending" && (leaveEmployeeFilter === "all" || lr.employeeId === leaveEmployeeFilter));
                  return rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                      <CalendarOff className="w-8 h-8 opacity-30" />
                      <p className="text-sm">No pending leave requests</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 font-medium text-muted-foreground">Employee</th>
                            <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                            <th className="text-left p-3 font-medium text-muted-foreground">From</th>
                            <th className="text-left p-3 font-medium text-muted-foreground">To</th>
                            <th className="text-left p-3 font-medium text-muted-foreground">Days</th>
                            <th className="text-left p-3 font-medium text-muted-foreground">Reason</th>
                            <th className="text-left p-3 font-medium text-muted-foreground">Submitted</th>
                            <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(lr => {
                            const emp = employees?.find(e => e.id === lr.employeeId);
                            const start = new Date(lr.startDate);
                            const end = new Date(lr.endDate);
                            const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
                            return (
                              <tr key={lr.id} className="border-b last:border-0" data-testid={`row-leave-${lr.id}`}>
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="w-7 h-7"><AvatarFallback className="text-xs">{emp?.name?.charAt(0) || "?"}</AvatarFallback></Avatar>
                                    <span className="font-medium">{emp?.name || "Unknown"}</span>
                                  </div>
                                </td>
                                <td className="p-3">
                                  <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">{leaveTypeLabel[lr.type] || lr.type}</Badge>
                                </td>
                                <td className="p-3">{start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                                <td className="p-3">{end.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                                <td className="p-3 text-muted-foreground">{days}d</td>
                                <td className="p-3 text-muted-foreground text-xs max-w-[160px] truncate">{lr.reason || "—"}</td>
                                <td className="p-3 text-muted-foreground text-xs">{new Date(lr.createdAt).toLocaleDateString("en-IN")}</td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-emerald-400 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 gap-1"
                                      data-testid={`button-approve-leave-${lr.id}`}
                                      onClick={() => { if (confirm(`Approve ${leaveTypeLabel[lr.type] || lr.type} leave for ${emp?.name}?`)) approveLeaveMutation.mutate(lr.id); }}
                                      disabled={approveLeaveMutation.isPending}
                                    >
                                      <Check className="w-3 h-3" /> Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 gap-1"
                                      data-testid={`button-reject-leave-${lr.id}`}
                                      onClick={() => { setRejectingLeaveId(lr.id); setRejectNote(""); setRejectDialogOpen(true); }}
                                    >
                                      <X className="w-3 h-3" /> Reject
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {leaveSubTab === "history" && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-0">
                  {lrLoading ? (
                    <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  ) : (() => {
                    const rows = allLeaveRequests.filter(lr => {
                    if (lr.status === "pending") return false;
                    if (leaveEmployeeFilter !== "all" && lr.employeeId !== leaveEmployeeFilter) return false;
                    if (leaveMonthFilter !== "all") {
                      const startMonth = new Date(lr.startDate).getMonth();
                      const startYear = new Date(lr.startDate).getFullYear();
                      if (startMonth !== parseInt(leaveMonthFilter) || startYear !== new Date().getFullYear()) return false;
                    }
                    return true;
                  });
                    return rows.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                        <CalendarOff className="w-8 h-8 opacity-30" />
                        <p className="text-sm">No leave history yet</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-3 font-medium text-muted-foreground">Employee</th>
                              <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                              <th className="text-left p-3 font-medium text-muted-foreground">From</th>
                              <th className="text-left p-3 font-medium text-muted-foreground">To</th>
                              <th className="text-left p-3 font-medium text-muted-foreground">Days</th>
                              <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                              <th className="text-left p-3 font-medium text-muted-foreground">Note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(lr => {
                              const emp = employees?.find(e => e.id === lr.employeeId);
                              const start = new Date(lr.startDate);
                              const end = new Date(lr.endDate);
                              const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
                              return (
                                <tr key={lr.id} className="border-b last:border-0">
                                  <td className="p-3">
                                    <div className="flex items-center gap-2">
                                      <Avatar className="w-7 h-7"><AvatarFallback className="text-xs">{emp?.name?.charAt(0) || "?"}</AvatarFallback></Avatar>
                                      <span className="font-medium">{emp?.name || "Unknown"}</span>
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">{leaveTypeLabel[lr.type] || lr.type}</Badge>
                                  </td>
                                  <td className="p-3">{start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                                  <td className="p-3">{end.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                                  <td className="p-3 text-muted-foreground">{days}d</td>
                                  <td className="p-3">
                                    {lr.status === "approved"
                                      ? <Badge variant="outline" className="border-emerald-400 text-emerald-600 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate">Approved</Badge>
                                      : <Badge variant="outline" className="border-red-400 text-red-600 dark:text-red-400 no-default-hover-elevate no-default-active-elevate">Rejected</Badge>
                                    }
                                  </td>
                                  <td className="p-3 text-xs text-muted-foreground max-w-[200px]">{lr.reviewNote || "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {leaveEmployeeFilter !== "all" && employees && (() => {
                const emp = employees.find(e => e.id === leaveEmployeeFilter);
                if (!emp) return null;
                const bal = getLeaveBalance(leaveEmployeeFilter);
                return (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Leave Balance — {emp.name} ({new Date().getFullYear()})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        {(["annual", "sick", "casual"] as const).map(t => (
                          <div key={t} className="p-3 rounded-lg border bg-muted/20 text-center space-y-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{leaveTypeLabel[t]}</p>
                            <p className="text-2xl font-bold">{bal[t].remaining}</p>
                            <p className="text-xs text-muted-foreground">of {bal[t].total} remaining</p>
                            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                              <div
                                className="bg-blue-500 h-1.5 rounded-full transition-all"
                                style={{ width: `${Math.round((bal[t].remaining / bal[t].total) * 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}
        </TabsContent>

        <TabsContent value="late_arrivals" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex rounded-lg border overflow-hidden">
              <button
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${larSubTab === "pending" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
                onClick={() => setLarSubTab("pending")}
                data-testid="button-lar-pending-tab"
              >
                Pending {allLateArrivalRequests.filter(r => r.status === "pending").length > 0 && `(${allLateArrivalRequests.filter(r => r.status === "pending").length})`}
              </button>
              <button
                className={`px-4 py-1.5 text-sm font-medium transition-colors border-l ${larSubTab === "history" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
                onClick={() => setLarSubTab("history")}
                data-testid="button-lar-history-tab"
              >
                History
              </button>
            </div>
            <Select value={larEmployeeFilter} onValueChange={setLarEmployeeFilter}>
              <SelectTrigger className="w-48" data-testid="select-lar-employee-filter">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees?.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {larLoading ? (
                <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : (() => {
                const rows = allLateArrivalRequests.filter(r => {
                  const matchStatus = larSubTab === "pending" ? r.status === "pending" : r.status !== "pending";
                  const matchEmp = larEmployeeFilter === "all" || r.employeeId === larEmployeeFilter;
                  return matchStatus && matchEmp;
                }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                return rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                    <AlarmClock className="w-8 h-8 opacity-30" />
                    <p className="text-sm">{larSubTab === "pending" ? "No pending late arrival requests" : "No history yet"}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-medium text-muted-foreground">Employee</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Expected Time</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Reason</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                          {larSubTab === "history" && <th className="text-left p-3 font-medium text-muted-foreground">Review Note</th>}
                          <th className="text-left p-3 font-medium text-muted-foreground">Submitted</th>
                          {larSubTab === "pending" && <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(lar => {
                          const emp = employees?.find(e => e.id === lar.employeeId);
                          return (
                            <tr key={lar.id} className="border-b last:border-0" data-testid={`row-lar-mgr-${lar.id}`}>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-7 h-7"><AvatarFallback className="text-xs">{emp?.name?.charAt(0) || "?"}</AvatarFallback></Avatar>
                                  <span className="font-medium">{emp?.name || "Unknown"}</span>
                                </div>
                              </td>
                              <td className="p-3">{new Date(lar.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                              <td className="p-3">{lar.expectedArrivalTime}</td>
                              <td className="p-3 text-muted-foreground text-xs max-w-[160px] truncate">{lar.reason}</td>
                              <td className="p-3">
                                {lar.status === "pending" && <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400 no-default-hover-elevate no-default-active-elevate">Pending</Badge>}
                                {lar.status === "approved" && <Badge variant="outline" className="border-emerald-400 text-emerald-600 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate">Approved</Badge>}
                                {lar.status === "rejected" && <Badge variant="outline" className="border-red-400 text-red-600 dark:text-red-400 no-default-hover-elevate no-default-active-elevate">Rejected</Badge>}
                              </td>
                              {larSubTab === "history" && (
                                <td className="p-3 text-xs text-muted-foreground max-w-[160px] truncate">{lar.reviewNote || "—"}</td>
                              )}
                              <td className="p-3 text-muted-foreground text-xs">{new Date(lar.createdAt).toLocaleDateString("en-IN")}</td>
                              {larSubTab === "pending" && (
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-emerald-400 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 gap-1"
                                      data-testid={`button-approve-lar-${lar.id}`}
                                      onClick={() => { if (confirm(`Approve late arrival for ${emp?.name || "this employee"} on ${lar.date}?`)) approveLarMutation.mutate(lar.id); }}
                                      disabled={approveLarMutation.isPending}
                                    >
                                      <Check className="w-3 h-3" /> Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 gap-1"
                                      data-testid={`button-reject-lar-${lar.id}`}
                                      onClick={() => { setRejectingLarId(lar.id); setRejectLarNote(""); setRejectLarDialogOpen(true); }}
                                    >
                                      <X className="w-3 h-3" /> Reject
                                    </Button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={rejectLarDialogOpen} onOpenChange={setRejectLarDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Late Arrival Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Provide a reason. The employee will be notified.</p>
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Textarea
                value={rejectLarNote}
                onChange={e => setRejectLarNote(e.target.value)}
                placeholder="e.g. Insufficient notice, operational needs..."
                rows={3}
                data-testid="input-reject-lar-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectLarDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!rejectLarNote.trim()) { toast({ title: "Reason required", variant: "destructive" }); return; }
                rejectLarMutation.mutate();
              }}
              disabled={rejectLarMutation.isPending}
              data-testid="button-confirm-reject-lar"
            >
              {rejectLarMutation.isPending ? "Rejecting..." : "Reject Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Provide a reason for rejection. The employee will be notified.</p>
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="e.g. Critical project deadline, insufficient notice..."
                rows={3}
                data-testid="input-reject-leave-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!rejectNote.trim()) { toast({ title: "Reason required", description: "Please provide a rejection reason.", variant: "destructive" }); return; }
                rejectLeaveMutation.mutate();
              }}
              disabled={rejectLeaveMutation.isPending}
              data-testid="button-confirm-reject-leave"
            >
              {rejectLeaveMutation.isPending ? "Rejecting..." : "Reject Leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingEmployee ? "Edit Employee" : "Add Employee"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="empName">Name</Label>
              <Input id="empName" data-testid="input-employee-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="empEmail">Email</Label>
              <Input
                id="empEmail"
                type="email"
                data-testid="input-employee-email"
                value={form.email}
                onChange={(e) => {
                  const newEmail = e.target.value;
                  setForm(prev => ({ ...prev, email: newEmail }));
                  setPortalForm(prev => {
                    if (prev.username === "" || prev.username === form.email) {
                      return { ...prev, username: newEmail };
                    }
                    return prev;
                  });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="empPhone">Phone</Label>
              <Input id="empPhone" data-testid="input-employee-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="empCompany">Company</Label>
              <Select value={form.company} onValueChange={(v) => setForm({ ...form, company: v })}>
                <SelectTrigger data-testid="select-employee-company">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {["IT Futuristic Industries PVT LTD", "Hussain Enterprise", "IT Traders", "IT Construction", "IT Saif Pharma"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="empDept">Department</Label>
              <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                <SelectTrigger data-testid="select-employee-department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Sales", "Operations", "Warehouse", "Finance", "HR", "IT"].map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="empDesignation">Designation</Label>
              <Input id="empDesignation" data-testid="input-employee-designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="empSalary">Monthly Salary</Label>
              <Input id="empSalary" type="number" data-testid="input-employee-salary" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="e.g. 25000" />
              {form.salary && Number(form.salary) > 0 && (
                <p className="text-xs text-muted-foreground" data-testid="text-daily-rate">Daily Rate: {"\u20B9"}{Math.round(Number(form.salary) / 26).toLocaleString("en-IN")} (26 working days)</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="empActive" data-testid="checkbox-employee-active" checked={form.isActive} onCheckedChange={(checked) => setForm({ ...form, isActive: !!checked })} />
              <Label htmlFor="empActive">Active</Label>
            </div>

            <div className="border rounded-md overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
                onClick={() => {
                  const next = !showPortalSection;
                  setShowPortalSection(next);
                  if (next && !portalForm.username) {
                    setPortalForm(prev => ({ ...prev, username: form.email }));
                  }
                }}
                data-testid="button-toggle-portal-section"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-blue-500" />
                  Portal Access (Login Account)
                  {editingEmployee && getLinkedUser(editingEmployee) && (
                    <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-xs no-default-hover-elevate no-default-active-elevate">
                      Linked
                    </Badge>
                  )}
                </span>
                {showPortalSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showPortalSection && (
                <div className="p-3 space-y-3 border-t">
                  {editingEmployee && getLinkedUser(editingEmployee) && (
                    <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
                      This employee has a linked account. Update username, role, or set a new password below. Leave password blank to keep current.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Username</Label>
                    <Input
                      data-testid="input-portal-username"
                      placeholder="e.g. john.doe or +919876543210"
                      value={portalForm.username}
                      onChange={(e) => setPortalForm({ ...portalForm, username: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{editingEmployee && getLinkedUser(editingEmployee) ? "New Password (leave blank to keep current)" : "Password"}</Label>
                    <Input
                      type="password"
                      data-testid="input-portal-password"
                      placeholder={editingEmployee && getLinkedUser(editingEmployee) ? "Leave blank to keep current" : "Enter password"}
                      value={portalForm.password}
                      onChange={(e) => setPortalForm({ ...portalForm, password: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Role</Label>
                    <Select value={portalForm.role} onValueChange={(v) => setPortalForm({ ...portalForm, role: v })}>
                      <SelectTrigger data-testid="select-portal-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="field_staff">Field Staff</SelectItem>
                        <SelectItem value="sales_manager">Sales Manager</SelectItem>
                        <SelectItem value="warehouse_manager">Warehouse Manager</SelectItem>
                        <SelectItem value="hr_manager">HR Manager</SelectItem>
                        <SelectItem value="accountant">Accountant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button
              data-testid="button-submit-employee"
              disabled={employeeMutation.isPending}
              onClick={() => {
                if (showPortalSection && !editingEmployee) {
                  if (portalForm.username && !portalForm.password) {
                    toast({ title: "Validation error", description: "Password is required to create a portal account.", variant: "destructive" });
                    return;
                  }
                  if (!portalForm.username && portalForm.password) {
                    toast({ title: "Validation error", description: "Username is required to create a portal account.", variant: "destructive" });
                    return;
                  }
                }
                employeeMutation.mutate({ ...form, ...portalForm });
              }}
            >
              {employeeMutation.isPending ? "Saving..." : editingEmployee ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Employee QR Code</DialogTitle>
          </DialogHeader>
          {qrData && (
            <div className="text-center space-y-4">
              <p className="font-semibold text-lg" data-testid="text-qr-employee-name">{qrData.employeeName}</p>
              <div className="flex justify-center">
                <img
                  src={qrData.qrDataUrl}
                  alt={`QR Code for ${qrData.employeeName}`}
                  className="w-64 h-64 border rounded-lg"
                  data-testid="img-qr-code"
                />
              </div>
              <p className="text-xs text-muted-foreground font-mono">{qrData.qrCode}</p>
              <Button onClick={downloadQr} className="w-full" data-testid="button-download-qr">
                <Download className="w-4 h-4 mr-2" />
                Download QR Code
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={idCardDialogOpen} onOpenChange={setIdCardDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Employee ID Card
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-5 py-2">
            {idCardEmployee && (
              <>
                <EmployeeIdCard employee={idCardEmployee} />
                <Button
                  className="w-full gap-2"
                  onClick={() => downloadIdCardPDF(idCardEmployee)}
                  data-testid="button-download-id-card-hr"
                >
                  <Download className="w-4 h-4" />
                  Download ID Card (PDF)
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Advance Record Dialog */}
      <Dialog open={advanceDialogOpen} onOpenChange={setAdvanceDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-amber-500" />
              Record Advance Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Advance will be deducted from the employee's next payroll disbursement.</p>
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={advanceForm.employeeId} onValueChange={v => setAdvanceForm({ ...advanceForm, employeeId: v })}>
                <SelectTrigger data-testid="select-advance-employee"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees?.filter(e => e.isActive).map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input type="number" data-testid="input-advance-amount" value={advanceForm.amount} onChange={e => setAdvanceForm({ ...advanceForm, amount: e.target.value })} placeholder="e.g. 5000" min="1" />
            </div>
            <div className="space-y-2">
              <Label>Date Given</Label>
              <Input type="date" data-testid="input-advance-date" value={advanceForm.dateGiven} onChange={e => setAdvanceForm({ ...advanceForm, dateGiven: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Reason <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input data-testid="input-advance-reason" value={advanceForm.reason} onChange={e => setAdvanceForm({ ...advanceForm, reason: e.target.value })} placeholder="e.g. Medical emergency" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => advanceMutation.mutate()} disabled={advanceMutation.isPending} data-testid="button-confirm-advance">
              {advanceMutation.isPending ? "Saving..." : "Record Advance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Incentive Record Dialog */}
      <Dialog open={incentiveDialogOpen} onOpenChange={setIncentiveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              🎁 Record Incentive
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Incentive will be added to the employee's next payroll disbursement.</p>
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={incentiveForm.employeeId} onValueChange={v => setIncentiveForm({ ...incentiveForm, employeeId: v })}>
                <SelectTrigger data-testid="select-incentive-employee"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees?.filter(e => e.isActive).map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input type="number" data-testid="input-incentive-amount" value={incentiveForm.amount} onChange={e => setIncentiveForm({ ...incentiveForm, amount: e.target.value })} placeholder="e.g. 2000" min="1" />
            </div>
            <div className="space-y-2">
              <Label>Date Given</Label>
              <Input type="date" data-testid="input-incentive-date" value={incentiveForm.dateGiven} onChange={e => setIncentiveForm({ ...incentiveForm, dateGiven: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Reason <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input data-testid="input-incentive-reason" value={incentiveForm.reason} onChange={e => setIncentiveForm({ ...incentiveForm, reason: e.target.value })} placeholder="e.g. Diwali bonus / Performance reward" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncentiveDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => incentiveMutation.mutate()} disabled={incentiveMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-confirm-incentive">
              {incentiveMutation.isPending ? "Saving..." : "Record Incentive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payslipOpen} onOpenChange={setPayslipOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col max-h-[90vh]">
          <DialogHeader className="sr-only">
            <DialogTitle>Payslip - {monthNames[payrollMonth]} {payrollYear}</DialogTitle>
          </DialogHeader>
          {payslipEmployee && (() => {
            const p = getPayrollData(payslipEmployee);
            const companyName = payslipEmployee.company || "ITFI Group";
            return (
              <div data-testid="payslip-content" className="flex flex-col overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <img src="/favicon.png" alt="ITFI Group" className="w-10 h-10 rounded-md object-contain bg-white/10 p-0.5" />
                      <div>
                        <h2 className="text-lg font-bold tracking-wide">{companyName}</h2>
                        <p className="text-slate-300 text-xs mt-0.5">A subsidiary of ITFI Group</p>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-300 space-y-0.5">
                      <div className="flex items-center justify-end gap-1.5"><Mail className="w-3 h-3" /> admin@itfi.co.in</div>
                      <div className="flex items-center justify-end gap-1.5"><Globe className="w-3 h-3" /> www.itfi.co.in</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-600 text-center">
                    <p className="text-sm font-semibold uppercase tracking-widest">Payslip</p>
                    <p className="text-slate-300 text-xs mt-0.5">{monthNames[payrollMonth]} {payrollYear}</p>
                  </div>
                </div>

                <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm border-b pb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Employee Name</p>
                      <p className="font-semibold" data-testid="text-payslip-name">{payslipEmployee.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Employee ID</p>
                      <p className="font-semibold">EMP-{String(payslipEmployee.id).padStart(4, "0")}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Designation</p>
                      <p className="font-medium">{payslipEmployee.designation}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Department</p>
                      <p className="font-medium">{payslipEmployee.department}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">Attendance Summary</h3>
                    <div className="grid grid-cols-4 gap-2 text-center text-sm">
                      <div className="p-2 rounded-md bg-muted/50">
                        <p className="text-lg font-bold">{p.workingDays}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Working</p>
                      </div>
                      <div className="p-2 rounded-md bg-emerald-500/10">
                        <p className="text-lg font-bold text-emerald-600">{p.fullDays}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Present</p>
                      </div>
                      <div className="p-2 rounded-md bg-amber-500/10">
                        <p className="text-lg font-bold text-amber-600">{p.halfDays}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Half Day</p>
                      </div>
                      <div className="p-2 rounded-md bg-red-500/10">
                        <p className="text-lg font-bold text-red-600">{p.daysAbsent}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Absent</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">Earnings & Deductions</h3>
                    <div className="text-sm border rounded-md divide-y">
                      <div className="flex justify-between gap-4 px-3 py-2 bg-muted/30">
                        <span className="text-muted-foreground">Monthly Salary (Gross)</span>
                        <span className="font-medium">{"\u20B9"}{p.monthlySalary.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between gap-4 px-3 py-2">
                        <span className="text-muted-foreground">Daily Rate (Salary / 26)</span>
                        <span>{"\u20B9"}{p.dailyRate.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between gap-4 px-3 py-2 bg-muted/30">
                        <span className="text-muted-foreground">Full Days ({p.fullDays} × {"\u20B9"}{p.dailyRate.toLocaleString("en-IN")})</span>
                        <span className="text-emerald-600 font-medium">{"\u20B9"}{(p.fullDays * p.dailyRate).toLocaleString("en-IN")}</span>
                      </div>
                      {p.halfDays > 0 && (
                        <div className="flex justify-between gap-4 px-3 py-2">
                          <span className="text-muted-foreground">Half Days ({p.halfDays} × {"\u20B9"}{Math.round(p.dailyRate / 2).toLocaleString("en-IN")})</span>
                          <span className="text-amber-600 font-medium">{"\u20B9"}{(p.halfDays * Math.round(p.dailyRate / 2)).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-4 px-3 py-2 bg-muted/30">
                        <span className="text-muted-foreground">Attendance Earned</span>
                        <span className="font-semibold text-emerald-600">{"\u20B9"}{p.earnedSalary.toLocaleString("en-IN")}</span>
                      </div>
                      {p.incentiveAmt > 0 && (
                        <div className="flex justify-between gap-4 px-3 py-2">
                          <span className="text-muted-foreground">
                            Incentive / Bonus
                            {p.incentiveDates.length > 0 && (
                              <span className="text-xs ml-1 text-muted-foreground/70">({p.incentiveDates.join(", ")})</span>
                            )}
                          </span>
                          <span className="text-emerald-600 font-medium">+{"\u20B9"}{p.incentiveAmt.toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {p.deductions > 0 && (
                        <div className="flex justify-between gap-4 px-3 py-2 bg-red-500/5">
                          <span className="text-muted-foreground">Attendance Deduction ({p.daysAbsent} absent)</span>
                          <span className="text-red-600 font-medium">-{"\u20B9"}{p.deductions.toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {p.advanceDeduct > 0 && (
                        <div className="flex justify-between gap-4 px-3 py-2 bg-red-500/5">
                          <span className="text-muted-foreground">
                            Advance Recovery
                            {p.advanceDates.length > 0 && (
                              <span className="text-xs ml-1 text-muted-foreground/70">({p.advanceDates.join(", ")})</span>
                            )}
                          </span>
                          <span className="text-red-600 font-medium">-{"\u20B9"}{p.advanceDeduct.toLocaleString("en-IN")}</span>
                        </div>
                      )}
                    </div>
                    {p.unrecoveredAdvance > 0 && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          Unrecovered advance of {"\u20B9"}{p.unrecoveredAdvance.toLocaleString("en-IN")} carries forward to next payroll.
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center px-4 py-3 rounded-md bg-slate-800 text-white">
                    <span className="font-semibold text-sm uppercase tracking-wide">Net Payable</span>
                    <span className="text-xl font-bold" data-testid="text-payslip-net">{"\u20B9"}{p.netPay.toLocaleString("en-IN")}</span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1 gap-2"
                      onClick={() => downloadPayslipPDF({
                        employeeName: payslipEmployee.name,
                        employeeId: payslipEmployee.id,
                        designation: payslipEmployee.designation,
                        department: payslipEmployee.department,
                        company: companyName,
                        month: monthNames[payrollMonth],
                        year: payrollYear,
                        monthlySalary: p.monthlySalary,
                        dailyRate: p.dailyRate,
                        fullDays: p.fullDays,
                        halfDays: p.halfDays,
                        daysAbsent: p.daysAbsent,
                        workingDays: p.workingDays,
                        earnedSalary: p.earnedSalary,
                        deductions: p.deductions,
                        incentiveAmt: p.incentiveAmt,
                        incentiveDates: p.incentiveDates,
                        advanceDeduct: p.advanceDeduct,
                        advanceDates: p.advanceDates,
                        unrecoveredAdvance: p.unrecoveredAdvance,
                        netPay: p.netPay,
                      })}
                      data-testid="button-download-payslip-pdf"
                    >
                      <FileText className="w-4 h-4" />
                      Download PDF
                    </Button>
                    <Button variant="outline" onClick={() => setPayslipOpen(false)}>Close</Button>
                  </div>

                  <p className="text-[10px] text-muted-foreground text-center">This is a system-generated payslip and does not require a signature.</p>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
