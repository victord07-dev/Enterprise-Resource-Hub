import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Search, Users, CalendarCheck, MapPin, UserCheck, Pencil, Trash2, QrCode, Download, Camera } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Employee, AttendanceRecord } from "@shared/schema";

export default function Employees() {
  const { toast } = useToast();
  const { data: employees, isLoading: empLoading } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: attendance, isLoading: attLoading } = useQuery<AttendanceRecord[]>({ queryKey: ["/api/attendance"] });

  const activeCount = employees?.filter((e) => e.isActive).length ?? 0;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", department: "Sales", designation: "", salary: "", isActive: true });

  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrData, setQrData] = useState<{ qrDataUrl: string; employeeName: string; qrCode: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const employeeMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingEmployee) {
        await apiRequest("PATCH", `/api/employees/${editingEmployee.id}`, data);
      } else {
        await apiRequest("POST", "/api/employees", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
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
    setForm({ name: "", email: "", phone: "", company: "", department: "Sales", designation: "", salary: "", isActive: true });
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

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Employee Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage staff, attendance, and field activities</p>
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

      <Tabs defaultValue="employees" className="space-y-4">
        <TabsList>
          <TabsTrigger value="employees" data-testid="tab-employees">Employees</TabsTrigger>
          <TabsTrigger value="attendance" data-testid="tab-attendance">Attendance</TabsTrigger>
          <TabsTrigger value="field-staff" data-testid="tab-field-staff">Field Staff</TabsTrigger>
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
                      <th className="text-left p-3 font-medium text-muted-foreground">QR Code</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 8 }).map((_, j) => (
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
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">No employees found.</td>
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
                              <Badge variant={a.status === "present" ? "default" : "secondary"}>
                                {a.status}
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

        <TabsContent value="field-staff">
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <MapPin className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium">Field Staff Monitoring</p>
              <p className="text-sm mt-1">Track field staff activities, visits, and daily logs.</p>
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
              <Input id="empEmail" type="email" data-testid="input-employee-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
              <Label htmlFor="empSalary">Salary</Label>
              <Input id="empSalary" type="number" data-testid="input-employee-salary" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="empActive" data-testid="checkbox-employee-active" checked={form.isActive} onCheckedChange={(checked) => setForm({ ...form, isActive: !!checked })} />
              <Label htmlFor="empActive">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-employee" disabled={employeeMutation.isPending} onClick={() => employeeMutation.mutate(form)}>
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
    </div>
  );
}
