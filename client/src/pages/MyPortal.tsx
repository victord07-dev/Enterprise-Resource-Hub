import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrentUser } from "@/lib/auth";
import { useNotificationBell } from "@/lib/notification-context";
import { useToast } from "@/hooks/use-toast";
import {
  User, Briefcase, Building2, Calendar, CalendarCheck, Wallet, CheckCircle2, XCircle, Clock,
  Megaphone, Bus, Train, Bike, Navigation, MapPinned, Pencil, RotateCcw, Bell, CheckCheck,
  CreditCard, Download, CornerDownLeft
} from "lucide-react";
import EmployeeIdCard from "@/components/EmployeeIdCard";
import { downloadIdCardPDF } from "@/lib/id-card-pdf";
import { getCurrentPosition } from "@/lib/geolocation";
import { Textarea } from "@/components/ui/textarea";
import type { Employee, AttendanceRecord, PayrollStatus, TravelExpense, Notification, LeaveRequest, LateArrivalRequest } from "@shared/schema";
import { todayIST } from "@shared/datetime";
import { AlarmClock } from "lucide-react";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function MyPortal() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("denied") === "1") {
      toast({ title: "Access Denied", description: "You don't have permission to view that page.", variant: "destructive" });
      window.history.replaceState({}, "", "/my-portal");
    }
  }, []);
  const employeeId = currentUser?.employeeId;

  const { data: employee } = useQuery<Employee>({
    queryKey: ["/api/employees", employeeId],
    queryFn: async () => {
      if (!employeeId) return undefined;
      const res = await fetch(`/api/employees/${employeeId}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      });
      return res.json();
    },
    enabled: !!employeeId,
  });
  const { data: myAttendance = [], isLoading: attLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["/api/attendance", { employeeId }],
    queryFn: async () => {
      if (!employeeId) return [];
      const res = await fetch(`/api/attendance?employeeId=${employeeId}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      });
      return res.json();
    },
    enabled: !!employeeId,
  });
  const { data: payrollStatuses } = useQuery<PayrollStatus[]>({ queryKey: ["/api/payroll-status"] });
  const { data: myNotifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 60000,
  });
  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });
  const { data: myExpenses = [], isLoading: teLoading } = useQuery<TravelExpense[]>({
    queryKey: ["/api/travel-expenses/employee", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const res = await fetch(`/api/travel-expenses/employee/${employeeId}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      });
      return res.json();
    },
    enabled: !!employeeId,
  });

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const thisMonthAttendance = myAttendance.filter(a => {
    const d = new Date(a.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const daysPresent = thisMonthAttendance.filter(a => a.status === "present").length;
  const daysHalfDay = thisMonthAttendance.filter(a => a.status === "half_day").length;
  const daysLeave = thisMonthAttendance.filter(a => a.status === "on_leave").length;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(currentYear, currentMonth, d).getDay() !== 0) workingDays++;
  }
  const daysAbsent = Math.max(0, workingDays - daysPresent - daysHalfDay - daysLeave);

  const recentPayroll = payrollStatuses
    ? [...payrollStatuses].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      }).slice(0, 6)
    : [];

  const monthlySalary = employee?.salary ? Number(employee.salary) : 0;
  const dailyRate = Math.round(monthlySalary / 26);

  const { openBell } = useNotificationBell();

  const { data: myLeaveRequests = [], isLoading: lrLoading } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave-requests"],
  });
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: "annual", startDate: "", endDate: "", reason: "" });
  const [rejectLeaveId, setRejectLeaveId] = useState<string | null>(null);

  const createLeaveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/leave-requests", leaveForm);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to submit"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({ title: "Leave request submitted", description: "Your request is pending approval." });
      setLeaveDialogOpen(false);
      setLeaveForm({ type: "annual", startDate: "", endDate: "", reason: "" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const withdrawLeaveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/leave-requests/${id}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({ title: "Leave request withdrawn" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const leaveTypeLabel: Record<string, string> = { annual: "Annual", sick: "Sick", casual: "Casual", unpaid: "Unpaid" };
  const leaveTypeColor: Record<string, string> = {
    annual: "border-blue-400 text-blue-600 dark:text-blue-400",
    sick: "border-red-400 text-red-600 dark:text-red-400",
    casual: "border-violet-400 text-violet-600 dark:text-violet-400",
    unpaid: "border-orange-400 text-orange-600 dark:text-orange-400",
  };

  const { data: myLateArrivalRequests = [], isLoading: larLoading } = useQuery<LateArrivalRequest[]>({
    queryKey: ["/api/late-arrival-requests"],
    enabled: !!employeeId,
  });
  const today = todayIST(); // IST-safe: no UTC midnight drift for India locale
  const [larDialogOpen, setLarDialogOpen] = useState(false);
  const [larForm, setLarForm] = useState({ date: today, expectedArrivalTime: "", reason: "" });

  const createLarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/late-arrival-requests", larForm);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to submit"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/late-arrival-requests"] });
      toast({ title: "Late arrival request submitted", description: "Your request is pending approval." });
      setLarDialogOpen(false);
      setLarForm({ date: today, expectedArrivalTime: "", reason: "" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const withdrawLarMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/late-arrival-requests/${id}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/late-arrival-requests"] });
      toast({ title: "Request withdrawn" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const [resubmitExpense, setResubmitExpense] = useState<TravelExpense | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editMode, setEditMode] = useState<"bus" | "train" | "bike">("bus");
  const [editOriginAddress, setEditOriginAddress] = useState("");
  const [editDestAddress, setEditDestAddress] = useState("");

  const rates: Record<string, number> = { bus: 10, train: 5, bike: 20 };
  const previewDist = resubmitExpense ? parseFloat(resubmitExpense.distance || "0") : 0;
  const previewTravelCost = Math.round(previewDist * (rates[editMode] || 10));
  const previewLunch = resubmitExpense ? parseFloat(resubmitExpense.lunchMoney || "200") : 200;
  const previewTotal = previewTravelCost + previewLunch;

  const resubmitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/travel-expenses/${resubmitExpense!.id}`, {
        notes: editNotes,
        transportMode: editMode,
        originAddress: editOriginAddress,
        destAddress: editDestAddress,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to resubmit");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/travel-expenses/employee", employeeId] });
      toast({ title: "Expense resubmitted", description: "Your expense has been resubmitted for approval." });
      setResubmitExpense(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openResubmit = (te: TravelExpense) => {
    setResubmitExpense(te);
    setEditNotes(te.notes || "");
    setEditMode((te.transportMode as "bus" | "train" | "bike") || "bus");
    setEditOriginAddress(te.originAddress || "");
    setEditDestAddress(te.destAddress || "");
  };

  if (userLoading) {
    return (
      <div className="p-6 space-y-6 overflow-auto h-full">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!employeeId) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <User className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">No Employee Record Linked</h2>
          <p className="text-sm text-muted-foreground mt-1">Your account is not linked to an employee record. Please contact an administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">My Portal</h1>
        <p className="text-muted-foreground text-sm mt-1">Your personal dashboard and records</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar className="w-20 h-20">
                <AvatarFallback className="text-2xl bg-blue-50 dark:bg-blue-950/30 text-blue-600">
                  {employee?.name?.charAt(0)?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-lg font-semibold" data-testid="text-emp-name">{employee?.name || currentUser?.fullName}</h2>
                <p className="text-sm text-muted-foreground" data-testid="text-emp-designation">{employee?.designation || "—"}</p>
              </div>
              <Badge variant={employee?.isActive ? "default" : "secondary"} className="no-default-hover-elevate no-default-active-elevate">
                {employee?.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>

            <div className="border-t pt-4 space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Department</p>
                  <p className="font-medium" data-testid="text-emp-department">{employee?.department || "—"}</p>
                </div>
              </div>
              {employee?.company && (
                <div className="flex items-center gap-3">
                  <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Company</p>
                    <p className="font-medium">{employee.company}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Joined</p>
                  <p className="font-medium">{employee?.joinDate ? new Date(employee.joinDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Wallet className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Monthly Salary</p>
                  <p className="font-medium" data-testid="text-emp-salary">{monthlySalary > 0 ? `₹${monthlySalary.toLocaleString("en-IN")}` : "—"}</p>
                </div>
              </div>
            </div>

          </CardContent>
        </Card>

        {employee && (
          <Card data-testid="section-id-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-500" />
                My ID Card
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {employee.qrCode ? (
                <>
                  <EmployeeIdCard employee={employee} />
                  <Button
                    className="w-full gap-2"
                    onClick={() => downloadIdCardPDF(employee)}
                    data-testid="button-download-id-card"
                  >
                    <Download className="w-4 h-4" />
                    Download ID Card (PDF)
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CreditCard className="w-10 h-10 text-muted-foreground opacity-40" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-qr-prompt">
                    No QR code generated yet. Ask HR to generate your QR code to enable attendance scanning and ID card download.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                {monthNames[currentMonth]} {currentYear} — Attendance Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {attLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400" data-testid="text-days-present">{daysPresent}</p>
                    <p className="text-xs text-muted-foreground">Present</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900">
                    <Clock className="w-5 h-5 text-amber-500" />
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-400" data-testid="text-days-halfday">{daysHalfDay}</p>
                    <p className="text-xs text-muted-foreground">Half Day</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900">
                    <XCircle className="w-5 h-5 text-red-500" />
                    <p className="text-2xl font-bold text-red-700 dark:text-red-400" data-testid="text-days-absent">{daysAbsent}</p>
                    <p className="text-xs text-muted-foreground">Absent</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900">
                    <Calendar className="w-5 h-5 text-blue-500" />
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-400" data-testid="text-days-leave">{daysLeave}</p>
                    <p className="text-xs text-muted-foreground">On Leave</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-emerald-500" />
                {monthNames[currentMonth]} {currentYear} — Daily Attendance Detail
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {attLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : thisMonthAttendance.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">In</th>
                        <th className="text-left p-3 font-medium text-muted-foreground text-orange-600">Lunch↑</th>
                        <th className="text-left p-3 font-medium text-muted-foreground text-orange-600">Lunch↓</th>
                        <th className="text-left p-3 font-medium text-muted-foreground text-purple-600">Tea↑</th>
                        <th className="text-left p-3 font-medium text-muted-foreground text-purple-600">Tea↓</th>
                        <th className="text-left p-3 font-medium text-muted-foreground text-teal-600">Field↑</th>
                        <th className="text-left p-3 font-medium text-muted-foreground text-teal-600">Field↓</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Out</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...thisMonthAttendance].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(a => {
                        const ft = (t: Date | string | null | undefined) => t ? new Date(t as string).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
                        return (
                          <tr key={a.id} className="border-b last:border-0" data-testid={`row-my-attendance-${a.id}`}>
                            <td className="p-3 font-medium">{new Date(a.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                            <td className="p-3">{ft(a.checkIn)}</td>
                            <td className="p-3 text-orange-600">{ft(a.lunchOut)}</td>
                            <td className="p-3 text-orange-600">{ft(a.lunchIn)}</td>
                            <td className="p-3 text-purple-600">{ft(a.teaOut)}</td>
                            <td className="p-3 text-purple-600">{ft(a.teaIn)}</td>
                            <td className="p-3 text-teal-600">{ft(a.fieldVisitOut)}</td>
                            <td className="p-3 text-teal-600">{ft(a.fieldVisitIn)}</td>
                            <td className="p-3">{ft(a.checkOut)}</td>
                            <td className="p-3">
                              <Badge
                                variant={a.status === "present" ? "default" : a.status === "half_day" ? "outline" : "secondary"}
                                className={`no-default-hover-elevate no-default-active-elevate ${a.status === "half_day" ? "border-amber-500 text-amber-600 dark:text-amber-400" : ""}`}
                                data-testid={`badge-my-att-status-${a.id}`}
                              >
                                {a.status === "half_day" ? "Half Day" : a.status === "on_leave" ? "On Leave" : a.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-6 text-center text-sm text-muted-foreground">No attendance records this month.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4 text-violet-500" />
                Salary Records
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-muted-foreground">Month</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Gross Salary</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Days Worked</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Net Pay</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayroll.length > 0 ? recentPayroll.map(ps => {
                    const empAttenMonth = myAttendance.filter(a => {
                      const d = new Date(a.date);
                      return d.getMonth() === ps.month && d.getFullYear() === ps.year;
                    });
                    const full = empAttenMonth.filter(a => a.status === "present").length;
                    const half = empAttenMonth.filter(a => a.status === "half_day").length;
                    const earned = (full * dailyRate) + (half * Math.round(dailyRate / 2));
                    return (
                      <tr key={ps.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{monthNames[ps.month]} {ps.year}</td>
                        <td className="p-3 text-right">{monthlySalary > 0 ? `₹${monthlySalary.toLocaleString("en-IN")}` : "—"}</td>
                        <td className="p-3 text-right text-muted-foreground">{full + half > 0 ? `${full}d + ${half}hd` : "—"}</td>
                        <td className="p-3 text-right font-medium">{earned > 0 ? `₹${earned.toLocaleString("en-IN")}` : "—"}</td>
                        <td className="p-3">
                          <Badge
                            variant={ps.status === "disbursed" ? "default" : "outline"}
                            className={ps.status === "disbursed" ? "bg-emerald-600 text-white no-default-hover-elevate no-default-active-elevate" : "border-amber-400 text-amber-600 no-default-hover-elevate no-default-active-elevate"}
                          >
                            {ps.status === "disbursed" ? "Paid" : "Pending"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">No payroll records yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-blue-500" />
            Announcements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-800">
            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Welcome to Hussain Enterprise ERP</p>
              <p className="text-xs text-muted-foreground mt-0.5">Please update your profile information and ensure your attendance is recorded daily via the kiosk system.</p>
            </div>
          </div>
          <div className="flex gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-800">
            <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Salary Disbursement</p>
              <p className="text-xs text-muted-foreground mt-0.5">Salaries are processed on the last working day of each month. Contact HR for any discrepancies.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-violet-500" />
              Recent Notifications
              {myNotifications.filter(n => !n.isRead).length > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-red-100 text-red-600 text-xs font-bold">
                  {myNotifications.filter(n => !n.isRead).length}
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-1">
              {myNotifications.filter(n => !n.isRead).length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  data-testid="button-portal-mark-all-read"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </Button>
              )}
              {myNotifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-blue-600 hover:text-blue-700"
                  data-testid="button-portal-view-all-notifications"
                  onClick={() => openBell()}
                >
                  View all
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {myNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
              <Bell className="h-6 w-6 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {myNotifications.slice(0, 5).map(n => {
                const typeIcon: Record<string, string> = {
                  expense_approved: "✅",
                  expense_rejected: "❌",
                  payroll_disbursed: "💰",
                };
                const diff = Date.now() - new Date(String(n.createdAt)).getTime();
                const mins = Math.floor(diff / 60000);
                const timeAgo = mins < 1 ? "Just now" : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
                return (
                  <div
                    key={n.id}
                    data-testid={`portal-notification-${n.id}`}
                    className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${!n.isRead ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
                    onClick={() => { if (!n.isRead) markReadMutation.mutate(n.id); }}
                  >
                    <span className="text-base mt-0.5 shrink-0">{typeIcon[n.type] ?? "🔔"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`text-sm font-medium leading-tight ${!n.isRead ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                        {!n.isRead && <span className="shrink-0 h-2 w-2 rounded-full bg-blue-500 mt-1.5" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo}</p>
                    </div>
                  </div>
                );
              })}
              {myNotifications.length > 5 && (
                <div className="px-4 py-2 text-center border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-blue-600 hover:text-blue-700 h-7"
                    data-testid="button-portal-view-all-footer"
                    onClick={() => openBell()}
                  >
                    View all {myNotifications.length} notifications
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {employeeId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                My Leave Requests
              </CardTitle>
              <Button size="sm" onClick={() => setLeaveDialogOpen(true)} data-testid="button-request-leave">
                Request Leave
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {lrLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : myLeaveRequests.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No leave requests yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">From</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">To</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Days</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Reason</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myLeaveRequests.map(lr => {
                      const start = new Date(lr.startDate);
                      const end = new Date(lr.endDate);
                      const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
                      return (
                        <tr key={lr.id} className="border-b last:border-0" data-testid={`row-leave-${lr.id}`}>
                          <td className="p-3">
                            <Badge variant="outline" className={`${leaveTypeColor[lr.type] || ""} no-default-hover-elevate no-default-active-elevate`}>
                              {leaveTypeLabel[lr.type] || lr.type}
                            </Badge>
                          </td>
                          <td className="p-3">{start.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                          <td className="p-3">{end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                          <td className="p-3 text-muted-foreground">{days}d</td>
                          <td className="p-3 text-muted-foreground max-w-[180px] truncate">{lr.reason || "—"}</td>
                          <td className="p-3">
                            {lr.status === "pending" && (
                              <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400 no-default-hover-elevate no-default-active-elevate">Pending</Badge>
                            )}
                            {lr.status === "approved" && (
                              <Badge variant="outline" className="border-emerald-400 text-emerald-600 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate">Approved</Badge>
                            )}
                            {lr.status === "rejected" && (
                              <div>
                                <Badge variant="outline" className="border-red-400 text-red-600 dark:text-red-400 no-default-hover-elevate no-default-active-elevate">Rejected</Badge>
                                {lr.reviewNote && <p className="text-xs text-red-500 mt-0.5">{lr.reviewNote}</p>}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {(lr.status === "pending" || lr.status === "rejected") && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20"
                                data-testid={`button-withdraw-leave-${lr.id}`}
                                onClick={() => { if (confirm("Withdraw this leave request?")) withdrawLeaveMutation.mutate(lr.id); }}
                                disabled={withdrawLeaveMutation.isPending}
                              >
                                Withdraw
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {employeeId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlarmClock className="w-4 h-4 text-amber-500" />
                My Late Arrival Requests
              </CardTitle>
              <Button size="sm" onClick={() => { setLarForm({ date: today, expectedArrivalTime: "", reason: "" }); setLarDialogOpen(true); }} data-testid="button-request-late-arrival">
                Request Late Arrival
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {larLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : myLateArrivalRequests.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No late arrival requests yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Expected Time</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Reason</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myLateArrivalRequests.map(lar => (
                      <tr key={lar.id} className="border-b last:border-0" data-testid={`row-lar-${lar.id}`}>
                        <td className="p-3">{new Date(lar.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                        <td className="p-3">{lar.expectedArrivalTime}</td>
                        <td className="p-3 text-muted-foreground max-w-[180px] truncate">{lar.reason}</td>
                        <td className="p-3">
                          {lar.status === "pending" && <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400 no-default-hover-elevate no-default-active-elevate">Pending</Badge>}
                          {lar.status === "approved" && <Badge variant="outline" className="border-emerald-400 text-emerald-600 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate">Approved</Badge>}
                          {lar.status === "rejected" && (
                            <div>
                              <Badge variant="outline" className="border-red-400 text-red-600 dark:text-red-400 no-default-hover-elevate no-default-active-elevate">Rejected</Badge>
                              {lar.reviewNote && <p className="text-xs text-red-500 mt-0.5">{lar.reviewNote}</p>}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {lar.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20"
                              data-testid={`button-withdraw-lar-${lar.id}`}
                              onClick={() => { if (confirm("Withdraw this late arrival request?")) withdrawLarMutation.mutate(lar.id); }}
                              disabled={withdrawLarMutation.isPending}
                            >
                              Withdraw
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {currentUser?.role === "field_staff" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPinned className="w-4 h-4 text-emerald-500" />
              My Travel Expenses
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {teLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : myExpenses.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Mode</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Distance</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Notes / Reason</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...myExpenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(te => {
                      const modeIcon = te.transportMode === "bus" ? <Bus className="w-3 h-3" /> : te.transportMode === "train" ? <Train className="w-3 h-3" /> : <Bike className="w-3 h-3" />;
                      return (
                        <tr key={te.id} className="border-b last:border-0" data-testid={`row-my-expense-${te.id}`}>
                          <td className="p-3">{new Date(te.date).toLocaleDateString("en-IN")}</td>
                          <td className="p-3">
                            <span className="flex items-center gap-1 capitalize">{modeIcon} {te.transportMode}</span>
                          </td>
                          <td className="p-3 text-right">{Number(te.distance).toFixed(1)} km</td>
                          <td className="p-3 text-right font-medium">₹{Number(te.totalAmount).toLocaleString("en-IN")}</td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              data-testid={`badge-my-expense-status-${te.id}`}
                              className={
                                te.status === "pending"
                                  ? "border-amber-400 text-amber-600 dark:text-amber-400 no-default-hover-elevate no-default-active-elevate"
                                  : te.status === "approved"
                                  ? "border-emerald-400 text-emerald-600 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate"
                                  : te.status === "disbursed"
                                  ? "border-emerald-600 text-emerald-700 dark:text-emerald-300 no-default-hover-elevate no-default-active-elevate"
                                  : "border-red-400 text-red-600 dark:text-red-400 no-default-hover-elevate no-default-active-elevate"
                              }
                            >
                              {te.status === "pending" ? "Pending" : te.status === "approved" ? "Approved" : te.status === "disbursed" ? "Paid" : "Rejected"}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground max-w-[200px]">
                            {te.status === "rejected" && te.rejectionReason ? (
                              <span className="text-red-600 dark:text-red-400">{te.rejectionReason}</span>
                            ) : (
                              te.notes || "—"
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {te.status === "rejected" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openResubmit(te)}
                                data-testid={`button-resubmit-expense-${te.id}`}
                                className="gap-1"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Edit & Resubmit
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">No travel expenses submitted yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={leaveForm.type} onValueChange={(v) => setLeaveForm({ ...leaveForm, type: v })}>
                <SelectTrigger data-testid="select-leave-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual Leave</SelectItem>
                  <SelectItem value="sick">Sick Leave</SelectItem>
                  <SelectItem value="casual">Casual Leave</SelectItem>
                  <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={leaveForm.startDate}
                  onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                  data-testid="input-leave-start"
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={leaveForm.endDate}
                  onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                  data-testid="input-leave-end"
                />
              </div>
            </div>
            {leaveForm.startDate && leaveForm.endDate && new Date(leaveForm.endDate) >= new Date(leaveForm.startDate) && (
              <p className="text-xs text-muted-foreground">
                Duration: {Math.round((new Date(leaveForm.endDate).getTime() - new Date(leaveForm.startDate).getTime()) / 86400000) + 1} day(s)
              </p>
            )}
            <div className="space-y-2">
              <Label>Reason <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                placeholder="Briefly describe the reason for your leave..."
                rows={3}
                data-testid="input-leave-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!leaveForm.startDate || !leaveForm.endDate) {
                  toast({ title: "Validation error", description: "Please select start and end dates.", variant: "destructive" });
                  return;
                }
                if (new Date(leaveForm.endDate) < new Date(leaveForm.startDate)) {
                  toast({ title: "Validation error", description: "End date must be on or after start date.", variant: "destructive" });
                  return;
                }
                createLeaveMutation.mutate();
              }}
              disabled={createLeaveMutation.isPending}
              data-testid="button-submit-leave"
            >
              {createLeaveMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={larDialogOpen} onOpenChange={setLarDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Late Arrival</DialogTitle>
            <DialogDescription>
              Submit a request to be marked as Present even if you check in after 9:35 AM.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                min={today}
                value={larForm.date}
                onChange={e => setLarForm({ ...larForm, date: e.target.value })}
                data-testid="input-lar-date"
              />
            </div>
            <div className="space-y-2">
              <Label>Expected Arrival Time</Label>
              <Input
                type="time"
                value={larForm.expectedArrivalTime}
                onChange={e => setLarForm({ ...larForm, expectedArrivalTime: e.target.value })}
                data-testid="input-lar-time"
              />
              <p className="text-xs text-muted-foreground">Enter the approximate time you expect to arrive.</p>
            </div>
            <div className="space-y-2">
              <Label>Reason <span className="text-red-500">*</span></Label>
              <Textarea
                value={larForm.reason}
                onChange={e => setLarForm({ ...larForm, reason: e.target.value })}
                placeholder="Briefly describe why you will be arriving late..."
                rows={3}
                data-testid="input-lar-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLarDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!larForm.date) { toast({ title: "Select a date", variant: "destructive" }); return; }
                if (!larForm.expectedArrivalTime) { toast({ title: "Enter expected arrival time", variant: "destructive" }); return; }
                if (!larForm.reason.trim()) { toast({ title: "Reason is required", variant: "destructive" }); return; }
                createLarMutation.mutate();
              }}
              disabled={createLarMutation.isPending}
              data-testid="button-submit-lar"
            >
              {createLarMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resubmitExpense} onOpenChange={(open) => { if (!open) setResubmitExpense(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit & Resubmit Expense</DialogTitle>
          </DialogHeader>
          {resubmitExpense && (
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm">
                <p className="font-medium text-red-700 dark:text-red-400">Rejection reason:</p>
                <p className="text-muted-foreground mt-0.5">{resubmitExpense.rejectionReason || "No reason provided"}</p>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">Date:</span>
                    <span className="ml-1 font-medium">{new Date(resubmitExpense.date).toLocaleDateString("en-IN")}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Distance:</span>
                    <span className="ml-1 font-medium">{Number(resubmitExpense.distance).toFixed(1)} km</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    GPS: {Number(resubmitExpense.originLat).toFixed(4)}, {Number(resubmitExpense.originLng).toFixed(4)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    → {Number(resubmitExpense.destLat).toFixed(4)}, {Number(resubmitExpense.destLng).toFixed(4)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>From (Location / Address)</Label>
                <Input
                  value={editOriginAddress}
                  onChange={e => setEditOriginAddress(e.target.value)}
                  placeholder="Origin location or address..."
                  data-testid="input-resubmit-origin"
                />
              </div>
              <div className="space-y-2">
                <Label>To (Location / Address)</Label>
                <Input
                  value={editDestAddress}
                  onChange={e => setEditDestAddress(e.target.value)}
                  placeholder="Destination location or address..."
                  data-testid="input-resubmit-dest"
                />
              </div>
              <div className="space-y-2">
                <Label>Transport Mode</Label>
                <Select value={editMode} onValueChange={(v) => setEditMode(v as "bus" | "train" | "bike")}>
                  <SelectTrigger data-testid="select-resubmit-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bus">Bus (₹10/km)</SelectItem>
                    <SelectItem value="train">Train (₹5/km)</SelectItem>
                    <SelectItem value="bike">Bike (₹20/km)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes / Purpose</Label>
                <Input
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Add or update trip purpose/notes..."
                  data-testid="input-resubmit-notes"
                />
              </div>
              <div className="rounded-md border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-3 text-sm space-y-1">
                <p className="font-medium text-xs text-blue-700 dark:text-blue-400 uppercase tracking-wide">Recomputed Cost Preview</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-muted-foreground text-xs">Travel</p>
                    <p className="font-medium">₹{previewTravelCost.toLocaleString("en-IN")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Lunch</p>
                    <p className="font-medium">₹{previewLunch.toLocaleString("en-IN")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Total</p>
                    <p className="font-semibold text-blue-700 dark:text-blue-400">₹{previewTotal.toLocaleString("en-IN")}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResubmitExpense(null)}>Cancel</Button>
            <Button
              onClick={() => resubmitMutation.mutate()}
              disabled={resubmitMutation.isPending}
              data-testid="button-confirm-resubmit"
            >
              {resubmitMutation.isPending ? "Resubmitting..." : "Resubmit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
