import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getCurrentPosition } from "@/lib/geolocation";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/auth";
import { Bus, Train, Bike, Navigation, MapPinned, Clock, DollarSign, Route, Play, CheckCircle, Banknote, MapPin, Users, Calendar, Eye, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Employee, TravelExpense, LocationLog, Trip } from "@shared/schema";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const createMarkerIcon = (type: 'staff' | 'origin' | 'destination') => {
  const hasPulse = type === 'staff' || type === 'origin';
  return L.divIcon({
    className: 'map-marker',
    html: `${hasPulse ? `<div class="map-marker-pulse ${type}"></div>` : ''}<div class="map-marker-dot ${type}"></div>`,
    iconSize: [24, 30],
    iconAnchor: [12, 30],
    popupAnchor: [0, -30],
  });
};

export default function FieldStaff() {
  const { toast } = useToast();
  const { data: currentUser } = useCurrentUser();
  const isFieldStaff = currentUser?.role === "field_staff";
  const isManagerOrAdmin = currentUser?.role === "admin" || currentUser?.role === "hr_manager";

  const { data: employees, isLoading: empLoading } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: travelExpenses, isLoading: teLoading } = useQuery<TravelExpense[]>({ queryKey: ["/api/travel-expenses"] });
  const { data: locationLogs } = useQuery<LocationLog[]>({ queryKey: ["/api/location-logs"] });
  const { data: allTrips } = useQuery<Trip[]>({ queryKey: ["/api/trips"] });
  const { data: activeTripsData } = useQuery<Trip[]>({ queryKey: ["/api/trips/active"], refetchInterval: 30000 });

  const [activeTab, setActiveTab] = useState("tracking");

  useEffect(() => {
    if (isFieldStaff) {
      setActiveTab("expenses");
    }
  }, [isFieldStaff]);

  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedTripRoute, setSelectedTripRoute] = useState<LocationLog[] | null>(null);
  const [selectedFieldEmployee, setSelectedFieldEmployee] = useState<string | null>(null);
  const [routeFilterEmployee, setRouteFilterEmployee] = useState<string>("all");

  const [originLat, setOriginLat] = useState<number | null>(null);
  const [originLng, setOriginLng] = useState<number | null>(null);
  const [destLat, setDestLat] = useState<number | null>(null);
  const [destLng, setDestLng] = useState<number | null>(null);
  const [transportMode, setTransportMode] = useState<string>("bus");
  const [expenseEmployeeId, setExpenseEmployeeId] = useState<string>("");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [gettingLocation, setGettingLocation] = useState(false);
  const [rejectExpenseId, setRejectExpenseId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [tripStarting, setTripStarting] = useState(false);
  const [tripStopping, setTripStopping] = useState(false);

  useEffect(() => {
    if (isFieldStaff && currentUser?.employeeId) {
      setExpenseEmployeeId(currentUser.employeeId);
    }
  }, [isFieldStaff, currentUser?.employeeId]);

  const myActiveTrip = isFieldStaff && currentUser?.employeeId
    ? activeTripsData?.find(t => t.employeeId === currentUser.employeeId) || null
    : null;

  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`, {
        headers: { "Accept-Language": "en" },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.display_name?.split(",").slice(0, 3).join(",").trim() || null;
    } catch {
      return null;
    }
  };

  const startTripMutation = useMutation({
    mutationFn: async () => {
      setTripStarting(true);
      const { latitude, longitude } = await getCurrentPosition({ enableHighAccuracy: true });
      const address = await reverseGeocode(latitude, longitude);
      const res = await apiRequest("POST", "/api/trips/start", {
        employeeId: currentUser?.employeeId,
        lat: latitude,
        lng: longitude,
        address,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to start trip");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips/active"] });
      toast({ title: "Trip started", description: "Your location will now be tracked." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => setTripStarting(false),
  });

  const stopTripMutation = useMutation({
    mutationFn: async (tripId: string) => {
      setTripStopping(true);
      let lat: number | undefined, lng: number | undefined;
      let address: string | null = null;
      try {
        const pos = await getCurrentPosition({ enableHighAccuracy: true });
        lat = pos.latitude; lng = pos.longitude;
        address = await reverseGeocode(lat, lng);
      } catch {}
      const res = await apiRequest("POST", `/api/trips/${tripId}/end`, { lat, lng, address });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to end trip");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips/active"] });
      toast({ title: "Trip ended", description: "Your trip has been recorded." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => setTripStopping(false),
  });

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
      destMarkerRef.current = L.marker(e.latlng, { icon: createMarkerIcon('destination') }).addTo(map).bindPopup("Destination").openPopup();
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

  const viewTripRoute = useCallback(async (tripId: string) => {
    try {
      const res = await fetch(`/api/trips/${tripId}/route`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const logs: LocationLog[] = await res.json();
      setSelectedTripId(tripId);
      setSelectedTripRoute(logs);
    } catch {
      toast({ title: "Error", description: "Failed to load route", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    if (!adminMapInstance.current) return;
    adminMarkersRef.current.forEach(m => m.remove());
    adminMarkersRef.current = [];
    if (adminPolylineRef.current) { adminPolylineRef.current.remove(); adminPolylineRef.current = null; }

    if (selectedTripRoute && selectedTripRoute.length > 0) {
      const sorted = [...selectedTripRoute].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const latlngs: L.LatLngExpression[] = sorted.map(l => [Number(l.lat), Number(l.lng)]);

      const startMarker = L.marker(latlngs[0] as L.LatLngExpression, { icon: createMarkerIcon('origin') })
        .addTo(adminMapInstance.current!)
        .bindPopup(`Start: ${new Date(sorted[0].timestamp).toLocaleTimeString()}`);
      adminMarkersRef.current.push(startMarker);

      if (latlngs.length > 1) {
        const endMarker = L.marker(latlngs[latlngs.length - 1] as L.LatLngExpression, { icon: createMarkerIcon('destination') })
          .addTo(adminMapInstance.current!)
          .bindPopup(`End: ${new Date(sorted[sorted.length - 1].timestamp).toLocaleTimeString()}`);
        adminMarkersRef.current.push(endMarker);

        adminPolylineRef.current = L.polyline(latlngs, { color: "#3b82f6", weight: 4, opacity: 0.8 }).addTo(adminMapInstance.current!);
        adminMapInstance.current!.fitBounds(adminPolylineRef.current.getBounds(), { padding: [40, 40] });
      } else {
        adminMapInstance.current!.setView(latlngs[0] as L.LatLngExpression, 14);
      }
    } else if (locationLogs && locationLogs.length > 0) {
      const latestByEmp: Record<string, LocationLog> = {};
      locationLogs.forEach(log => {
        if (!latestByEmp[log.employeeId] || new Date(log.timestamp) > new Date(latestByEmp[log.employeeId].timestamp)) {
          latestByEmp[log.employeeId] = log;
        }
      });
      Object.values(latestByEmp).forEach(log => {
        const marker = L.marker([Number(log.lat), Number(log.lng)], { icon: createMarkerIcon('staff') })
          .addTo(adminMapInstance.current!)
          .bindPopup(getEmployeeName(log.employeeId));
        adminMarkersRef.current.push(marker);
      });
    }
  }, [locationLogs, selectedTripRoute, getEmployeeName]);


  useEffect(() => {
    if (!destMapInstance.current) return;
    if (originLat !== null && originLng !== null) {
      if (originMarkerRef.current) originMarkerRef.current.remove();
      originMarkerRef.current = L.marker([originLat, originLng], {
        icon: createMarkerIcon('origin'),
      }).addTo(destMapInstance.current).bindPopup("Your Location");
      destMapInstance.current.setView([originLat, originLng], 12);
    }
  }, [originLat, originLng]);

  const getMyLocation = async () => {
    setGettingLocation(true);
    try {
      const { latitude, longitude } = await getCurrentPosition({ enableHighAccuracy: true });
      setOriginLat(latitude);
      setOriginLng(longitude);
      toast({ title: "Location obtained", description: `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}` });
    } catch (err: any) {
      toast({ title: "Location error", description: err.message ?? "Unable to get location", variant: "destructive" });
    } finally {
      setGettingLocation(false);
    }
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

  const rejectExpenseMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("PATCH", `/api/travel-expenses/${id}/reject`, { reason });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to reject");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/travel-expenses"] });
      toast({ title: "Expense rejected", description: "The rejection reason has been recorded." });
      setRejectExpenseId(null);
      setRejectReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const activeTripsCount = activeTripsData?.length ?? 0;
  const completedTrips = allTrips?.filter(t => t.status === "completed") ?? [];
  const pendingExpenses = travelExpenses?.filter(te => te.status === "pending").length ?? 0;
  const totalExpensesAmount = travelExpenses?.reduce((sum, te) => sum + Number(te.totalAmount), 0) ?? 0;

  const filteredCompletedTrips = routeFilterEmployee === "all"
    ? completedTrips
    : completedTrips.filter(t => t.employeeId === routeFilterEmployee);

  const groupedTrips = filteredCompletedTrips.reduce<Record<string, Trip[]>>((acc, trip) => {
    const dateKey = new Date(trip.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(trip);
    return acc;
  }, {});

  const sortedDateKeys = Object.keys(groupedTrips).sort((a, b) => {
    const dateA = new Date(groupedTrips[a][0].date).getTime();
    const dateB = new Date(groupedTrips[b][0].date).getTime();
    return dateB - dateA;
  });

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

      {isFieldStaff && (
        <Card className={myActiveTrip ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20" : ""}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-md flex items-center justify-center ${myActiveTrip ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-muted"}`}>
                  <Navigation className={`w-5 h-5 ${myActiveTrip ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    {myActiveTrip ? "Trip in Progress" : "No Active Trip"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {myActiveTrip
                      ? `Started at ${new Date(myActiveTrip.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Start a trip to begin location tracking"}
                  </p>
                </div>
                {myActiveTrip && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
              </div>
              <div>
                {!myActiveTrip ? (
                  <Button
                    onClick={() => startTripMutation.mutate()}
                    disabled={tripStarting || startTripMutation.isPending}
                    data-testid="button-start-trip"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {tripStarting || startTripMutation.isPending ? "Starting..." : "Start Trip"}
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    onClick={() => stopTripMutation.mutate(myActiveTrip.id)}
                    disabled={tripStopping || stopTripMutation.isPending}
                    data-testid="button-stop-trip"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {tripStopping || stopTripMutation.isPending ? "Stopping..." : "End Trip"}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          {!isFieldStaff && <TabsTrigger value="tracking" data-testid="tab-tracking">Live Tracking</TabsTrigger>}
          <TabsTrigger value="expenses" data-testid="tab-expenses">Travel Expenses</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">Expense History</TabsTrigger>
        </TabsList>

        <TabsContent value="tracking" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              {activeTripsCount > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Play className="w-4 h-4 text-emerald-500" />
                      Active Trips ({activeTripsCount})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {activeTripsData?.map(trip => (
                      <div
                        key={trip.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800"
                        data-testid={`active-trip-${trip.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{getEmployeeName(trip.employeeId)}</p>
                            <p className="text-xs text-muted-foreground">Started {new Date(trip.startTime).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-emerald-600 border-emerald-300 no-default-hover-elevate no-default-active-elevate">Live</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Route className="w-4 h-4" />
                    Recorded Routes
                    <Badge variant="secondary" className="ml-auto no-default-hover-elevate no-default-active-elevate" data-testid="badge-route-count">{filteredCompletedTrips.length}</Badge>
                  </CardTitle>
                  <div className="pt-2">
                    <Select value={routeFilterEmployee} onValueChange={setRouteFilterEmployee}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-route-filter-employee">
                        <SelectValue placeholder="Filter by employee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Employees</SelectItem>
                        {employees?.map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 max-h-[400px] overflow-y-auto">
                  {sortedDateKeys.length > 0 ? (
                    sortedDateKeys.map(dateKey => (
                      <div key={dateKey} className="space-y-1">
                        <div className="flex items-center gap-2 py-1.5 sticky top-0 bg-card z-10" data-testid={`date-group-${dateKey}`}>
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{dateKey}</span>
                          <div className="flex-1 border-t border-muted" />
                        </div>
                        {groupedTrips[dateKey].map(trip => (
                          <div
                            key={trip.id}
                            className={`flex items-center justify-between gap-2 p-2.5 rounded-md cursor-pointer border transition-colors ${selectedTripId === trip.id ? "bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-700" : "hover:bg-muted border-transparent"}`}
                            onClick={() => viewTripRoute(trip.id)}
                            data-testid={`trip-route-${trip.id}`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar className="w-7 h-7">
                                <AvatarFallback className="text-[10px]">{getEmployeeName(trip.employeeId).charAt(0).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{getEmployeeName(trip.employeeId)}</p>
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <Clock className="w-3 h-3 shrink-0" />
                                  {new Date(trip.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  {trip.endTime && <> → {new Date(trip.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>}
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5" data-testid={`text-trip-coords-${trip.id}`}>
                                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate">
                                    {trip.startAddress
                                      ? trip.startAddress
                                      : trip.startLat ? `${Number(trip.startLat).toFixed(3)}, ${Number(trip.startLng).toFixed(3)}` : "—"}
                                  </span>
                                  <span className="shrink-0"> → </span>
                                  <span className="truncate">
                                    {trip.endAddress
                                      ? trip.endAddress
                                      : trip.endLat ? `${Number(trip.endLat).toFixed(3)}, ${Number(trip.endLng).toFixed(3)}` : "In progress"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <Button size="sm" variant="ghost" className="shrink-0" data-testid={`button-view-route-${trip.id}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">No recorded trips yet. Trips are started by field staff from their devices.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPinned className="w-4 h-4" />
                  {selectedTripId ? "Trip Route" : "Live Location Map"}
                  {selectedTripId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => { setSelectedTripId(null); setSelectedTripRoute(null); }}
                      data-testid="button-clear-route"
                    >
                      Clear Route
                    </Button>
                  )}
                  {!selectedTripId && activeTripsCount > 0 && (
                    <Badge variant="outline" className="ml-auto no-default-hover-elevate no-default-active-elevate">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-1" />
                      {activeTripsCount} active
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div ref={adminMapRef} style={{ height: 450 }} className="rounded-md border" data-testid="map-admin-location" />
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
                  {!isFieldStaff && (
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
                  )}

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
                      {!isFieldStaff && <th className="text-left p-3 font-medium text-muted-foreground">Employee</th>}
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Route</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Distance</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Mode</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Total</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Rejection Reason</th>
                      {isManagerOrAdmin && <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {teLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 8 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-16" /></td>
                          ))}
                        </tr>
                      ))
                    ) : (() => {
                      const visibleExpenses = isFieldStaff
                        ? (travelExpenses || []).filter(te => te.employeeId === currentUser?.employeeId)
                        : (travelExpenses || []);
                      return visibleExpenses.length > 0 ? (
                        visibleExpenses.map(te => {
                          const modeIcon = te.transportMode === "bus" ? <Bus className="w-3 h-3" /> : te.transportMode === "train" ? <Train className="w-3 h-3" /> : <Bike className="w-3 h-3" />;
                          return (
                            <tr key={te.id} className="border-b last:border-0" data-testid={`row-expense-${te.id}`}>
                              {!isFieldStaff && (
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="w-6 h-6">
                                      <AvatarFallback className="text-[10px]">{getEmployeeName(te.employeeId).charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium">{getEmployeeName(te.employeeId)}</span>
                                  </div>
                                </td>
                              )}
                              <td className="p-3 text-muted-foreground">{new Date(te.date).toLocaleDateString("en-IN")}</td>
                              <td className="p-3 text-xs text-muted-foreground">
                                {Number(te.originLat).toFixed(2)},{Number(te.originLng).toFixed(2)} {"\u2192"} {Number(te.destLat).toFixed(2)},{Number(te.destLng).toFixed(2)}
                              </td>
                              <td className="p-3 text-right">{Number(te.distance).toFixed(1)} km</td>
                              <td className="p-3">
                                <span className="flex items-center gap-1 capitalize">{modeIcon} {te.transportMode}</span>
                              </td>
                              <td className="p-3 text-right font-medium" data-testid={`text-expense-total-${te.id}`}>{"\u20B9"}{Number(te.totalAmount).toLocaleString("en-IN")}</td>
                              <td className="p-3">
                                <Badge
                                  data-testid={`badge-expense-status-${te.id}`}
                                  variant="outline"
                                  className={
                                    te.status === "pending"
                                      ? "border-amber-500 text-amber-600 dark:text-amber-400 no-default-hover-elevate no-default-active-elevate"
                                      : te.status === "approved"
                                      ? "border-blue-500 text-blue-600 dark:text-blue-400 no-default-hover-elevate no-default-active-elevate"
                                      : te.status === "disbursed"
                                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate"
                                      : "border-red-500 text-red-600 dark:text-red-400 no-default-hover-elevate no-default-active-elevate"
                                  }
                                >
                                  {te.status === "pending" ? "Pending" : te.status === "approved" ? "Approved" : te.status === "disbursed" ? "Disbursed" : "Rejected"}
                                </Badge>
                              </td>
                              <td className="p-3 text-xs text-muted-foreground max-w-[180px]">
                                {te.status === "rejected" && te.rejectionReason ? (
                                  <span className="text-red-600 dark:text-red-400">{te.rejectionReason}</span>
                                ) : "—"}
                              </td>
                              {isManagerOrAdmin && (
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {te.status === "pending" && (
                                      <>
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
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => { setRejectExpenseId(te.id); setRejectReason(""); }}
                                          disabled={rejectExpenseMutation.isPending}
                                          data-testid={`button-reject-expense-${te.id}`}
                                          className="border-red-300 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                                        >
                                          <XCircle className="w-3 h-3 mr-1" />
                                          Reject
                                        </Button>
                                      </>
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
                              )}
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={isManagerOrAdmin ? 9 : 8} className="p-8 text-center text-muted-foreground">
                            <DollarSign className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p>No travel expenses submitted yet.</p>
                            <p className="text-xs mt-1">Go to the Travel Expenses tab to submit a claim.</p>
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejectExpenseId} onOpenChange={(open) => { if (!open) { setRejectExpenseId(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Travel Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Please provide a reason for rejection. The field staff member will see this reason and can edit & resubmit.</p>
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. Distance seems incorrect, please resubmit with correct route..."
                rows={3}
                data-testid="input-reject-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectExpenseId(null); setRejectReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectExpenseMutation.mutate({ id: rejectExpenseId!, reason: rejectReason })}
              disabled={rejectExpenseMutation.isPending || !rejectReason.trim()}
              data-testid="button-confirm-reject"
            >
              {rejectExpenseMutation.isPending ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
