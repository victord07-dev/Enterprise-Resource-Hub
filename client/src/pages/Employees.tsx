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
import { Plus, Search, Users, CalendarCheck, MapPin, UserCheck, Pencil, Trash2, QrCode, Download, Wallet, ChevronLeft, ChevronRight, Eye, Mail, Globe, CheckCircle2, ShieldCheck, ShieldOff, KeyRound, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Employee, AttendanceRecord, PayrollStatus } from "@shared/schema";

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

  const now = new Date();
  const [payrollMonth, setPayrollMonth] = useState(now.getMonth());
  const [payrollYear, setPayrollYear] = useState(now.getFullYear());
  const [payslipEmployee, setPayslipEmployee] = useState<Employee | null>(null);
  const [payslipOpen, setPayslipOpen] = useState(false);

  const { data: payrollStatusData, isLoading: psLoading } = useQuery<PayrollStatus | null>({
    queryKey: ["/api/payroll-status", payrollMonth, payrollYear],
  });

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
      toast({ title: "Payroll disbursed", description: `${monthNames[payrollMonth]} ${payrollYear} payroll marked as disbursed.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
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
    const netPay = earnedSalary;
    return { monthlySalary, dailyRate, fullDays, halfDays, daysAbsent, workingDays, earnedSalary, deductions, netPay };
  };

  const prevMonth = () => {
    if (payrollMonth === 0) { setPayrollMonth(11); setPayrollYear(payrollYear - 1); }
    else setPayrollMonth(payrollMonth - 1);
  };
  const nextMonth = () => {
    if (payrollMonth === 11) { setPayrollMonth(0); setPayrollYear(payrollYear + 1); }
    else setPayrollMonth(payrollMonth + 1);
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
                      <th className="text-left p-3 font-medium text-muted-foreground">Check Out</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Break Time</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Location</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attLoading ? (
                      <tr><td colSpan={11} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : attendance && attendance.length > 0 ? (
                      attendance.map((a) => {
                        const formatTime = (t: Date | string | null) => t ? new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "\u2014";
                        let totalBreakMins = 0;
                        if (a.lunchOut && a.lunchIn) totalBreakMins += Math.round((new Date(a.lunchIn).getTime() - new Date(a.lunchOut).getTime()) / 60000);
                        if (a.teaOut && a.teaIn) totalBreakMins += Math.round((new Date(a.teaIn).getTime() - new Date(a.teaOut).getTime()) / 60000);
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
                        <td colSpan={11} className="p-8 text-center text-muted-foreground">
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
                      <th className="text-right p-3 font-medium text-muted-foreground">Monthly Salary</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Daily Rate</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Full Days</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Half Days</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Absent</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Earned</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Deductions</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Net Pay</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Payslip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 11 }).map((_, j) => (
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
                            <td className="p-3 text-right text-red-600 dark:text-red-400">{p.deductions > 0 ? `\u20B9${p.deductions.toLocaleString("en-IN")}` : "\u2014"}</td>
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
                        <td colSpan={11} className="p-8 text-center text-muted-foreground">
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
                        <td className="p-3 text-right font-semibold text-red-600 dark:text-red-400" data-testid="text-total-deductions">
                          {"\u20B9"}{employees.filter(e => e.isActive).reduce((sum, emp) => sum + getPayrollData(emp).deductions, 0).toLocaleString("en-IN")}
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
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEmployee ? "Edit Employee" : "Add Employee"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
          <DialogFooter>
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

      <Dialog open={payslipOpen} onOpenChange={setPayslipOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Payslip - {monthNames[payrollMonth]} {payrollYear}</DialogTitle>
          </DialogHeader>
          {payslipEmployee && (() => {
            const p = getPayrollData(payslipEmployee);
            const companyName = payslipEmployee.company || "ITFI Group";
            return (
              <div data-testid="payslip-content">
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

                <div className="px-6 py-5 space-y-5">
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
                    <div className="text-sm border rounded-md">
                      <div className="flex justify-between gap-4 px-3 py-2 bg-muted/30">
                        <span className="text-muted-foreground">Monthly Salary (Gross)</span>
                        <span className="font-medium">{"\u20B9"}{p.monthlySalary.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between gap-4 px-3 py-2">
                        <span className="text-muted-foreground">Daily Rate (Salary / 26)</span>
                        <span>{"\u20B9"}{p.dailyRate.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between gap-4 px-3 py-2 bg-muted/30">
                        <span className="text-muted-foreground">Full Days ({p.fullDays} x {"\u20B9"}{p.dailyRate.toLocaleString("en-IN")})</span>
                        <span className="text-emerald-600 font-medium">{"\u20B9"}{(p.fullDays * p.dailyRate).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between gap-4 px-3 py-2">
                        <span className="text-muted-foreground">Half Days ({p.halfDays} x {"\u20B9"}{Math.round(p.dailyRate / 2).toLocaleString("en-IN")})</span>
                        <span className="text-amber-600 font-medium">{"\u20B9"}{(p.halfDays * Math.round(p.dailyRate / 2)).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between gap-4 px-3 py-2 bg-muted/30 border-t">
                        <span className="text-muted-foreground font-medium">Total Deductions</span>
                        <span className="text-red-600 font-medium">{p.deductions > 0 ? `-\u20B9${p.deductions.toLocaleString("en-IN")}` : "\u2014"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center px-4 py-3 rounded-md bg-slate-800 text-white">
                    <span className="font-semibold text-sm uppercase tracking-wide">Net Payable</span>
                    <span className="text-xl font-bold" data-testid="text-payslip-net">{"\u20B9"}{p.netPay.toLocaleString("en-IN")}</span>
                  </div>

                  <p className="text-[10px] text-muted-foreground text-center pt-1">This is a system-generated payslip and does not require a signature.</p>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
