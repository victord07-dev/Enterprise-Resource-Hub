import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrentUser } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  User, Briefcase, Building2, Calendar, Wallet, CheckCircle2, XCircle, Clock,
  Megaphone, Bus, Train, Bike, Navigation, MapPinned, Pencil, RotateCcw
} from "lucide-react";
import { getCurrentPosition } from "@/lib/geolocation";
import type { Employee, AttendanceRecord, PayrollStatus, TravelExpense } from "@shared/schema";

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
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
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
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      return res.json();
    },
    enabled: !!employeeId,
  });
  const { data: payrollStatuses } = useQuery<PayrollStatus[]>({ queryKey: ["/api/payroll-status"] });
  const { data: myExpenses = [], isLoading: teLoading } = useQuery<TravelExpense[]>({
    queryKey: ["/api/travel-expenses/employee", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const res = await fetch(`/api/travel-expenses/employee/${employeeId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
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
        <Card className="lg:col-span-1">
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
              <p className="text-sm font-medium">Welcome to ITFI Group ERP</p>
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
                                  ? "border-blue-400 text-blue-600 dark:text-blue-400 no-default-hover-elevate no-default-active-elevate"
                                  : te.status === "disbursed"
                                  ? "border-emerald-400 text-emerald-600 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate"
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
