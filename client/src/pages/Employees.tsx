import { useState, useEffect, useRef, useCallback } from "react";
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
import { Plus, Search, Users, CalendarCheck, MapPin, UserCheck, Pencil, Trash2, QrCode, Download, Camera, Wallet, ChevronLeft, ChevronRight, Eye, Building2, Phone, Mail, Globe, CheckCircle2, Bus, Train, Bike, Navigation, MapPinned, Clock, DollarSign, Route, Play, Square, CheckCircle, Banknote } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Employee, AttendanceRecord, PayrollStatus, TravelExpense, LocationLog } from "@shared/schema";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function Employees() {
  const { toast } = useToast();
  const { data: employees, isLoading: empLoading } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: attendance, isLoading: attLoading } = useQuery<AttendanceRecord[]>({ queryKey: ["/api/attendance"] });

  const activeCount = employees?.filter((e) => e.isActive).length ?? 0;

  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get("tab") || "employees";
  const [activeTab, setActiveTab] = useState(initialTab);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", department: "Sales", designation: "", salary: "", isActive: true });

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

  const { data: travelExpenses, isLoading: teLoading } = useQuery<TravelExpense[]>({ queryKey: ["/api/travel-expenses"] });
  const { data: locationLogs } = useQuery<LocationLog[]>({ queryKey: ["/api/location-logs"] });

  const [activeTrips, setActiveTrips] = useState<Record<string, boolean>>({});
  const [selectedFieldEmployee, setSelectedFieldEmployee] = useState<string | null>(null);
  const tripIntervals = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const [originLat, setOriginLat] = useState<number | null>(null);
  const [originLng, setOriginLng] = useState<number | null>(null);
  const [destLat, setDestLat] = useState<number | null>(null);
  const [destLng, setDestLng] = useState<number | null>(null);
  const [transportMode, setTransportMode] = useState<string>("bus");
  const [expenseEmployeeId, setExpenseEmployeeId] = useState<string>("");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [gettingLocation, setGettingLocation] = useState(false);

  const adminMapRef = useRef<HTMLDivElement>(null);
  const adminMapInstance = useRef<L.Map | null>(null);
  const adminMarkersRef = useRef<L.Marker[]>([]);
  const adminPolylineRef = useRef<L.Polyline | null>(null);

  const destMapRef = useRef<HTMLDivElement>(null);
  const destMapInstance = useRef<L.Map | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);

  const transportRates: Record<string, number> = { bus: 10, train: 5, bike: 20 };
  const LUNCH_MONEY = 200;

  const haversineDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1.3;
  }, []);

  const calculatedDistance = originLat !== null && originLng !== null && destLat !== null && destLng !== null
    ? haversineDistance(originLat, originLng, destLat, destLng)
    : 0;
  const travelCost = Math.round(calculatedDistance * (transportRates[transportMode] || 10));
  const totalExpense = travelCost + LUNCH_MONEY;

  const sendLocationLog = useCallback(async (employeeId: string) => {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
      );
      await apiRequest("POST", "/api/location-logs", {
        employeeId,
        lat: String(pos.coords.latitude),
        lng: String(pos.coords.longitude),
        tripActive: true,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/location-logs"] });
    } catch {
      // silently fail for background GPS
    }
  }, []);

  const toggleTrip = useCallback((employeeId: string) => {
    setActiveTrips(prev => {
      const isActive = !prev[employeeId];
      if (isActive) {
        sendLocationLog(employeeId);
        tripIntervals.current[employeeId] = setInterval(() => sendLocationLog(employeeId), 5 * 60 * 1000);
      } else {
        if (tripIntervals.current[employeeId]) {
          clearInterval(tripIntervals.current[employeeId]);
          delete tripIntervals.current[employeeId];
        }
      }
      return { ...prev, [employeeId]: isActive };
    });
  }, [sendLocationLog]);

  useEffect(() => {
    return () => {
      Object.values(tripIntervals.current).forEach(clearInterval);
    };
  }, []);

  useEffect(() => {
    if (!adminMapRef.current || adminMapInstance.current) return;
    const map = L.map(adminMapRef.current).setView([20.5937, 78.9629], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    adminMapInstance.current = map;
    return () => { map.remove(); adminMapInstance.current = null; };
  }, [activeTab]);

  useEffect(() => {
    if (!adminMapInstance.current || !locationLogs) return;
    adminMarkersRef.current.forEach(m => m.remove());
    adminMarkersRef.current = [];
    if (adminPolylineRef.current) { adminPolylineRef.current.remove(); adminPolylineRef.current = null; }

    const latestByEmp: Record<string, LocationLog> = {};
    locationLogs.forEach(log => {
      if (!latestByEmp[log.employeeId] || new Date(log.timestamp) > new Date(latestByEmp[log.employeeId].timestamp)) {
        latestByEmp[log.employeeId] = log;
      }
    });

    Object.values(latestByEmp).forEach(log => {
      const marker = L.marker([Number(log.lat), Number(log.lng)])
        .addTo(adminMapInstance.current!)
        .bindPopup(getEmployeeName(log.employeeId));
      adminMarkersRef.current.push(marker);
    });

    if (selectedFieldEmployee) {
      const today = new Date().toDateString();
      const empLogs = locationLogs
        .filter(log => log.employeeId === selectedFieldEmployee && new Date(log.timestamp).toDateString() === today)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (empLogs.length > 1) {
        const latlngs: L.LatLngExpression[] = empLogs.map(l => [Number(l.lat), Number(l.lng)]);
        adminPolylineRef.current = L.polyline(latlngs, { color: "#3b82f6", weight: 3 }).addTo(adminMapInstance.current!);
        adminMapInstance.current!.fitBounds(adminPolylineRef.current.getBounds(), { padding: [30, 30] });
      }
    }
  }, [locationLogs, selectedFieldEmployee, getEmployeeName]);

  useEffect(() => {
    if (!destMapRef.current || destMapInstance.current) return;
    const map = L.map(destMapRef.current).setView([20.5937, 78.9629], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      setDestLat(e.latlng.lat);
      setDestLng(e.latlng.lng);
      if (destMarkerRef.current) destMarkerRef.current.remove();
      destMarkerRef.current = L.marker(e.latlng).addTo(map).bindPopup("Destination").openPopup();
    });
    destMapInstance.current = map;
    return () => { map.remove(); destMapInstance.current = null; };
  }, [activeTab]);

  useEffect(() => {
    if (!destMapInstance.current) return;
    if (originLat !== null && originLng !== null) {
      if (originMarkerRef.current) originMarkerRef.current.remove();
      originMarkerRef.current = L.marker([originLat, originLng], {
        icon: L.icon({
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          className: "origin-marker-icon",
        }),
      }).addTo(destMapInstance.current).bindPopup("Your Location");
      destMapInstance.current.setView([originLat, originLng], 12);
    }
  }, [originLat, originLng]);

  const getMyLocation = () => {
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOriginLat(pos.coords.latitude);
        setOriginLng(pos.coords.longitude);
        setGettingLocation(false);
        toast({ title: "Location obtained", description: `Lat: ${pos.coords.latitude.toFixed(4)}, Lng: ${pos.coords.longitude.toFixed(4)}` });
      },
      (err) => {
        setGettingLocation(false);
        toast({ title: "Location error", description: err.message, variant: "destructive" });
      },
      { enableHighAccuracy: true }
    );
  };

  const expenseSubmitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/travel-expenses", {
        employeeId: expenseEmployeeId,
        originLat: String(originLat),
        originLng: String(originLng),
        destLat: String(destLat),
        destLng: String(destLng),
        distance: String(calculatedDistance.toFixed(2)),
        transportMode,
        travelCost: String(travelCost),
        lunchMoney: String(LUNCH_MONEY),
        totalAmount: String(totalExpense),
        notes: expenseNotes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/travel-expenses"] });
      toast({ title: "Expense submitted", description: `Total: \u20B9${totalExpense.toLocaleString("en-IN")}` });
      setOriginLat(null); setOriginLng(null); setDestLat(null); setDestLng(null);
      setTransportMode("bus"); setExpenseEmployeeId(""); setExpenseNotes("");
      if (destMarkerRef.current) { destMarkerRef.current.remove(); destMarkerRef.current = null; }
      if (originMarkerRef.current) { originMarkerRef.current.remove(); originMarkerRef.current = null; }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("PATCH", `/api/travel-expenses/${id}/approve`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/travel-expenses"] });
      toast({ title: "Expense approved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const disburseTravelMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("PATCH", `/api/travel-expenses/${id}/disburse`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/travel-expenses"] });
      toast({ title: "Expense disbursed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="employees" data-testid="tab-employees">Employees</TabsTrigger>
          <TabsTrigger value="attendance" data-testid="tab-attendance">Attendance</TabsTrigger>
          <TabsTrigger value="field-staff" data-testid="tab-field-staff">Field Staff</TabsTrigger>
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
                        <td colSpan={10} className="p-8 text-center text-muted-foreground">No employees found.</td>
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

        <TabsContent value="field-staff" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Navigation className="w-4 h-4" />
                  Field Staff
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {empLoading ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
                ) : employees && employees.length > 0 ? (
                  employees.map(emp => (
                    <div
                      key={emp.id}
                      className={`flex items-center justify-between gap-2 p-2 rounded-md cursor-pointer ${selectedFieldEmployee === emp.id ? "bg-muted" : ""}`}
                      onClick={() => setSelectedFieldEmployee(selectedFieldEmployee === emp.id ? null : emp.id)}
                      data-testid={`field-employee-${emp.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="w-7 h-7">
                          <AvatarFallback className="text-xs">{emp.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{emp.name}</p>
                          <p className="text-xs text-muted-foreground">{emp.department}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={activeTrips[emp.id] ? "destructive" : "default"}
                        onClick={(e) => { e.stopPropagation(); toggleTrip(emp.id); }}
                        data-testid={`button-toggle-trip-${emp.id}`}
                      >
                        {activeTrips[emp.id] ? <><Square className="w-3 h-3 mr-1" /> End</> : <><Play className="w-3 h-3 mr-1" /> Start</>}
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No employees found</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPinned className="w-4 h-4" />
                  Live Location Map
                  {selectedFieldEmployee && (
                    <Badge variant="outline" className="ml-auto no-default-hover-elevate no-default-active-elevate">
                      <Route className="w-3 h-3 mr-1" />
                      {getEmployeeName(selectedFieldEmployee)} - Today's Route
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div ref={adminMapRef} style={{ height: 300 }} className="rounded-md border" data-testid="map-admin-location" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Submit Travel Expense
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Select value={expenseEmployeeId} onValueChange={setExpenseEmployeeId}>
                      <SelectTrigger data-testid="select-expense-employee">
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees?.map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Origin (Your Location)</Label>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={getMyLocation} disabled={gettingLocation} data-testid="button-get-location">
                        <Navigation className="w-4 h-4 mr-2" />
                        {gettingLocation ? "Getting..." : "Get My Location"}
                      </Button>
                      {originLat !== null && (
                        <span className="text-xs text-muted-foreground" data-testid="text-origin-coords">
                          {originLat.toFixed(4)}, {originLng!.toFixed(4)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Destination (Click on map)</Label>
                    <div ref={destMapRef} style={{ height: 300 }} className="rounded-md border" data-testid="map-destination" />
                    {destLat !== null && (
                      <p className="text-xs text-muted-foreground" data-testid="text-dest-coords">
                        Destination: {destLat.toFixed(4)}, {destLng!.toFixed(4)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Transport Mode</Label>
                    <Select value={transportMode} onValueChange={setTransportMode}>
                      <SelectTrigger data-testid="select-transport-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bus"><span className="flex items-center gap-2"><Bus className="w-4 h-4" /> Bus ({"\u20B9"}10/km)</span></SelectItem>
                        <SelectItem value="train"><span className="flex items-center gap-2"><Train className="w-4 h-4" /> Train ({"\u20B9"}5/km)</span></SelectItem>
                        <SelectItem value="bike"><span className="flex items-center gap-2"><Bike className="w-4 h-4" /> Bike ({"\u20B9"}20/km)</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Input value={expenseNotes} onChange={e => setExpenseNotes(e.target.value)} placeholder="Trip purpose..." data-testid="input-expense-notes" />
                  </div>
                </div>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Banknote className="w-4 h-4" />
                        Expense Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Distance (approx)</span>
                        <span className="font-medium" data-testid="text-calc-distance">{calculatedDistance.toFixed(2)} km</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Rate ({transportMode})</span>
                        <span>{"\u20B9"}{transportRates[transportMode]}/km</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Travel Cost ({calculatedDistance.toFixed(1)} km x {"\u20B9"}{transportRates[transportMode]})</span>
                        <span className="font-medium" data-testid="text-travel-cost">{"\u20B9"}{travelCost.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Lunch Money (fixed)</span>
                        <span data-testid="text-lunch-money">{"\u20B9"}{LUNCH_MONEY}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between gap-4 font-bold">
                        <span>Total</span>
                        <span data-testid="text-total-expense">{"\u20B9"}{totalExpense.toLocaleString("en-IN")}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Button
                    className="w-full"
                    disabled={!expenseEmployeeId || originLat === null || destLat === null || expenseSubmitMutation.isPending}
                    onClick={() => expenseSubmitMutation.mutate()}
                    data-testid="button-submit-expense"
                  >
                    {expenseSubmitMutation.isPending ? "Submitting..." : "Submit Expense"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Travel Expense History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Employee</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Route</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Distance</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Mode</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Travel Cost</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Lunch</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Total</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 10 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-16" /></td>
                          ))}
                        </tr>
                      ))
                    ) : travelExpenses && travelExpenses.length > 0 ? (
                      travelExpenses.map(te => {
                        const modeIcon = te.transportMode === "bus" ? <Bus className="w-3 h-3" /> : te.transportMode === "train" ? <Train className="w-3 h-3" /> : <Bike className="w-3 h-3" />;
                        return (
                          <tr key={te.id} className="border-b last:border-0" data-testid={`row-expense-${te.id}`}>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-6 h-6">
                                  <AvatarFallback className="text-[10px]">{getEmployeeName(te.employeeId).charAt(0)}</AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{getEmployeeName(te.employeeId)}</span>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground">{new Date(te.date).toLocaleDateString("en-IN")}</td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {Number(te.originLat).toFixed(2)},{Number(te.originLng).toFixed(2)} {"\u2192"} {Number(te.destLat).toFixed(2)},{Number(te.destLng).toFixed(2)}
                            </td>
                            <td className="p-3 text-right">{Number(te.distance).toFixed(1)} km</td>
                            <td className="p-3">
                              <span className="flex items-center gap-1 capitalize">{modeIcon} {te.transportMode}</span>
                            </td>
                            <td className="p-3 text-right">{"\u20B9"}{Number(te.travelCost).toLocaleString("en-IN")}</td>
                            <td className="p-3 text-right">{"\u20B9"}{Number(te.lunchMoney).toLocaleString("en-IN")}</td>
                            <td className="p-3 text-right font-medium" data-testid={`text-expense-total-${te.id}`}>{"\u20B9"}{Number(te.totalAmount).toLocaleString("en-IN")}</td>
                            <td className="p-3">
                              <Badge
                                data-testid={`badge-expense-status-${te.id}`}
                                variant={te.status === "disbursed" ? "default" : "outline"}
                                className={
                                  te.status === "pending"
                                    ? "border-amber-500 text-amber-600 dark:text-amber-400 no-default-hover-elevate no-default-active-elevate"
                                    : te.status === "approved"
                                    ? "border-blue-500 text-blue-600 dark:text-blue-400 no-default-hover-elevate no-default-active-elevate"
                                    : "bg-emerald-600 text-white no-default-hover-elevate no-default-active-elevate"
                                }
                              >
                                {te.status === "pending" ? "Pending" : te.status === "approved" ? "Approved" : "Disbursed"}
                              </Badge>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {te.status === "pending" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => approveMutation.mutate(te.id)}
                                    disabled={approveMutation.isPending}
                                    data-testid={`button-approve-expense-${te.id}`}
                                  >
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Approve
                                  </Button>
                                )}
                                {te.status === "approved" && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => disburseTravelMutation.mutate(te.id)}
                                    disabled={disburseTravelMutation.isPending}
                                    data-testid={`button-disburse-expense-${te.id}`}
                                  >
                                    <Banknote className="w-3 h-3 mr-1" />
                                    Disburse
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-muted-foreground">
                          <DollarSign className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                          <p>No travel expenses submitted yet.</p>
                          <p className="text-xs mt-1">Use the form above to submit a travel expense claim.</p>
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
