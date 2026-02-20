import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Bus, Train, Bike, Navigation, MapPinned, Clock, DollarSign, Route, Play, Square, CheckCircle, Banknote, MapPin, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Employee, TravelExpense, LocationLog } from "@shared/schema";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function FieldStaff() {
  const { toast } = useToast();
  const { data: employees, isLoading: empLoading } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: travelExpenses, isLoading: teLoading } = useQuery<TravelExpense[]>({ queryKey: ["/api/travel-expenses"] });
  const { data: locationLogs } = useQuery<LocationLog[]>({ queryKey: ["/api/location-logs"] });

  const [activeTab, setActiveTab] = useState("tracking");

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

  const adminMapInstance = useRef<L.Map | null>(null);
  const adminMarkersRef = useRef<L.Marker[]>([]);
  const adminPolylineRef = useRef<L.Polyline | null>(null);

  const destMapInstance = useRef<L.Map | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);

  const adminMapRef = useCallback((node: HTMLDivElement | null) => {
    if (adminMapInstance.current) {
      try { adminMapInstance.current.remove(); } catch {}
      adminMapInstance.current = null;
    }
    adminMarkersRef.current = [];
    adminPolylineRef.current = null;
    if (!node) return;
    const map = L.map(node).setView([20.5937, 78.9629], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    adminMapInstance.current = map;
    setTimeout(() => map.invalidateSize(), 100);
  }, []);

  const destMapRef = useCallback((node: HTMLDivElement | null) => {
    if (destMapInstance.current) {
      try { destMapInstance.current.remove(); } catch {}
      destMapInstance.current = null;
    }
    destMarkerRef.current = null;
    originMarkerRef.current = null;
    if (!node) return;
    const map = L.map(node).setView([20.5937, 78.9629], 5);
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
    setTimeout(() => map.invalidateSize(), 100);
  }, []);

  const transportRates: Record<string, number> = { bus: 10, train: 5, bike: 20 };
  const LUNCH_MONEY = 200;

  const getEmployeeName = useCallback((empId: string) => {
    return employees?.find(e => e.id === empId)?.name || "Unknown";
  }, [employees]);

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

  const activeTripsCount = Object.values(activeTrips).filter(Boolean).length;
  const pendingExpenses = travelExpenses?.filter(te => te.status === "pending").length ?? 0;
  const totalExpensesAmount = travelExpenses?.reduce((sum, te) => sum + Number(te.totalAmount), 0) ?? 0;

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Field Staff</h1>
        <p className="text-muted-foreground text-sm mt-1">Track field staff locations, manage travel expenses and trips</p>
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
              <MapPin className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeTripsCount}</p>
              <p className="text-xs text-muted-foreground">Active Trips</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingExpenses}</p>
              <p className="text-xs text-muted-foreground">Pending Expenses</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{"\u20B9"}{totalExpensesAmount.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">Total Expenses</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="tracking" data-testid="tab-tracking">Live Tracking</TabsTrigger>
          <TabsTrigger value="expenses" data-testid="tab-expenses">Travel Expenses</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">Expense History</TabsTrigger>
        </TabsList>

        <TabsContent value="tracking" className="space-y-6">
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
                <div ref={adminMapRef} style={{ height: 400 }} className="rounded-md border" data-testid="map-admin-location" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-6">
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
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
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
                          <p className="text-xs mt-1">Go to the Travel Expenses tab to submit a claim.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
