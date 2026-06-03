import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Car, Plus, Search, Edit, Eye, AlertTriangle, Fuel, Wrench,
  ReceiptText, Navigation, FileBarChart2, RefreshCw,
  MapPin, Locate, TrendingUp, Clock, Route,
} from "lucide-react";

// ── Leaflet (lazy to avoid SSR issues) ────────────────────────────────────────
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icon paths broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const START_ICON = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const END_ICON = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: string | number | null | undefined) {
  if (n == null || n === "") return "—";
  const num = Number(n);
  return isNaN(num) ? "—" : `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}
function expiryBadge(label: string, dateStr: string | null | undefined) {
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days < 0) return <Badge variant="destructive" className="text-xs">{label}: Expired</Badge>;
  if (days <= 30) return <Badge variant="outline" className="text-xs border-orange-400 text-orange-600">{label}: {days}d</Badge>;
  return null;
}
function fmtDuration(minutes: number | null | undefined) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Vehicle {
  id: string; name: string; registrationNo: string; type: string;
  make?: string | null; model?: string | null; year?: number | null;
  ownershipType: string; fuelType: string;
  fuelEfficiency?: string | null; fuelRatePerLitre?: string | null;
  ratePerKm?: string | null; baseCharge?: string | null;
  insuranceExpiry?: string | null; fitnessExpiry?: string | null; permitExpiry?: string | null;
  currentOdometer?: string | null; status: string; notes?: string | null;
  fixedAssetId?: string | null; createdAt: string;
}
interface FixedAsset { id: string; name: string; category: string; }
interface Employee { id: string; name: string; designation: string; department: string; isActive: boolean; }
interface Customer { id: string; name: string; phone?: string | null; }
interface VehicleTrip {
  id: string; tripNumber: string; customerId: string; vehicleId: string; driverId: string;
  startLocation: string; endLocation: string;
  distanceKm?: string | null; startOdometer?: string | null; endOdometer?: string | null;
  tripDate: string; returnTrip: boolean; purpose?: string | null; notes?: string | null;
  status: string; fuelCostEstimate?: string | null; revenueEstimate?: string | null;
  startLat?: string | null; startLng?: string | null;
  endLat?: string | null; endLng?: string | null;
  estimatedDurationMinutes?: number | null; createdAt: string;
}
interface VehicleTripInvoice {
  id: string; invoiceNumber: string; tripId: string; customerId: string;
  invoiceDate: string; dueDate?: string | null;
  subtotal: string; gstRate: string; taxAmount: string; grandTotal: string;
  creditedAmount: string; distanceKm?: string | null; ratePerKm?: string | null;
  baseCharge?: string | null; status: string; notes?: string | null;
  outstanding?: number;
}
interface CashAccount { id: string; name: string; accountType: string; balance?: string; }
interface VehicleFuelLog {
  id: string; vehicleId: string; tripId?: string | null;
  logDate: string; litres: string; ratePerLitre: string; totalCost: string;
  odometerReading?: string | null; vendorName?: string | null; notes?: string | null;
  expenseId?: string | null; postedToAccounts: boolean;
  postedAt?: string | null; postedBy?: string | null;
  createdBy: string; createdAt: string;
}
interface VehicleMaintenanceLog {
  id: string; vehicleId: string;
  serviceDate: string; serviceType: string;
  vendorName?: string | null; cost: string;
  odometerReading?: string | null; nextServiceDate?: string | null;
  nextServiceOdometer?: string | null; notes?: string | null;
  expenseId?: string | null; postedToAccounts: boolean;
  postedAt?: string | null; postedBy?: string | null;
  createdBy: string; createdAt: string;
}
interface ExpenseCategory { id: string; name: string; isActive: boolean; }

interface NominatimResult {
  place_id: number; display_name: string; lat: string; lon: string;
  address?: { road?: string; city?: string; state?: string; country?: string; };
}

// ── Blank forms ───────────────────────────────────────────────────────────────
const BLANK_VEHICLE = {
  name: "", registrationNo: "", type: "car", make: "", model: "", year: null as number | null,
  ownershipType: "owned", fuelType: "diesel", fuelEfficiency: "", fuelRatePerLitre: "",
  ratePerKm: "", baseCharge: "0", insuranceExpiry: "", fitnessExpiry: "", permitExpiry: "",
  currentOdometer: "0", status: "active", notes: "", fixedAssetId: null as string | null,
};

const BLANK_TRIP = {
  customerId: "", vehicleId: "", driverId: "",
  startLocation: "", endLocation: "",
  distanceKm: "", startOdometer: "", endOdometer: "",
  tripDate: new Date().toISOString().slice(0, 10),
  returnTrip: false, purpose: "", notes: "",
  startLat: null as number | null, startLng: null as number | null,
  endLat: null as number | null, endLng: null as number | null,
  estimatedDurationMinutes: null as number | null,
};

const BLANK_FUEL_LOG = {
  vehicleId: "", tripId: "",
  logDate: new Date().toISOString().slice(0, 10),
  litres: "", ratePerLitre: "", totalCost: "", notes: "",
};
const BLANK_POST_FUEL = { categoryId: "", cashAccountId: "", paymentMethod: "cash", notes: "" };

const SERVICE_TYPES = [
  { value: "oil_change", label: "Oil Change" },
  { value: "tyre", label: "Tyre" },
  { value: "brake", label: "Brake" },
  { value: "major_service", label: "Major Service" },
  { value: "inspection", label: "Inspection" },
  { value: "cleaning", label: "Cleaning" },
  { value: "other", label: "Other" },
];
const BLANK_MAINTENANCE_LOG = {
  vehicleId: "", serviceDate: new Date().toISOString().slice(0, 10),
  serviceType: "oil_change", vendorName: "", cost: "",
  odometerReading: "", nextServiceDate: "", notes: "",
};
const BLANK_POST_MAINTENANCE = { categoryId: "", cashAccountId: "", paymentMethod: "cash", notes: "" };

// ═══════════════════════════════════════════════════════════════════════════════
// MapPanel — self-contained Leaflet component for trip creation
// ═══════════════════════════════════════════════════════════════════════════════
interface MapPanelProps {
  startCoords: { lat: number; lng: number } | null;
  endCoords: { lat: number; lng: number } | null;
  onMapClick: (latlng: { lat: number; lng: number }, type: "start" | "end") => void;
  placingPin: "start" | "end";
  routeGeometry?: [number, number][];
  isOpen: boolean;
}

function MapPanel({ startCoords, endCoords, onMapClick, placingPin, routeGeometry, isOpen }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const endMarkerRef = useRef<L.Marker | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);

  // Initialize map once container is in DOM
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [26.1445, 91.7362], // Guwahati, Assam
      zoom: 8,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    map.on("click", (e) => onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }, placingPin));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line

  // invalidateSize whenever the dialog opens — critical for Leaflet in Dialog
  useEffect(() => {
    if (isOpen && mapRef.current) {
      const t = setTimeout(() => mapRef.current?.invalidateSize(), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Update map click handler when placingPin changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.off("click");
    mapRef.current.on("click", (e) => onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }, placingPin));
  }, [placingPin, onMapClick]);

  // Update start marker
  useEffect(() => {
    if (!mapRef.current) return;
    if (startMarkerRef.current) { startMarkerRef.current.remove(); startMarkerRef.current = null; }
    if (startCoords) {
      startMarkerRef.current = L.marker([startCoords.lat, startCoords.lng], { icon: START_ICON })
        .bindPopup("Start").addTo(mapRef.current);
    }
  }, [startCoords]);

  // Update end marker
  useEffect(() => {
    if (!mapRef.current) return;
    if (endMarkerRef.current) { endMarkerRef.current.remove(); endMarkerRef.current = null; }
    if (endCoords) {
      endMarkerRef.current = L.marker([endCoords.lat, endCoords.lng], { icon: END_ICON })
        .bindPopup("Destination").addTo(mapRef.current);
    }
  }, [endCoords]);

  // Fit map to show both markers
  useEffect(() => {
    if (!mapRef.current) return;
    if (startCoords && endCoords) {
      mapRef.current.fitBounds(
        [[startCoords.lat, startCoords.lng], [endCoords.lat, endCoords.lng]],
        { padding: [40, 40] }
      );
    } else if (startCoords) {
      mapRef.current.setView([startCoords.lat, startCoords.lng], 12);
    } else if (endCoords) {
      mapRef.current.setView([endCoords.lat, endCoords.lng], 12);
    }
  }, [startCoords, endCoords]);

  // Draw route
  useEffect(() => {
    if (!mapRef.current) return;
    if (routeLayerRef.current) { routeLayerRef.current.remove(); routeLayerRef.current = null; }
    if (routeGeometry && routeGeometry.length > 1) {
      routeLayerRef.current = L.polyline(routeGeometry.map(([lng, lat]) => [lat, lng] as [number, number]), {
        color: "#2563eb", weight: 4, opacity: 0.8,
      }).addTo(mapRef.current);
    }
  }, [routeGeometry]);

  return <div ref={containerRef} className="w-full h-full rounded-l-lg" style={{ minHeight: 480 }} />;
}

// ── Address autocomplete hook ──────────────────────────────────────────────────
function useNominatim(query: string, enabled: boolean) {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || query.trim().length < 3) { setResults([]); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        setResults(data);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, enabled]);

  return { results, loading, clear: () => setResults([]) };
}

// ── LocationField — address input with autocomplete + pin toggle ───────────────
interface LocationFieldProps {
  label: string; value: string;
  onValueChange: (val: string) => void;
  onCoordSelect: (lat: number, lng: number, address: string) => void;
  pinType: "start" | "end";
  activePinType: "start" | "end";
  onActivePinChange: (t: "start" | "end") => void;
  coords: { lat: number; lng: number } | null;
}
function LocationField({
  label, value, onValueChange, onCoordSelect,
  pinType, activePinType, onActivePinChange, coords,
}: LocationFieldProps) {
  const [focused, setFocused] = useState(false);
  const { results, loading, clear } = useNominatim(value, focused);
  const isActive = activePinType === pinType;

  return (
    <div className="relative">
      <Label className="flex items-center gap-1.5 mb-1">
        <span className={`w-2.5 h-2.5 rounded-full ${pinType === "start" ? "bg-green-500" : "bg-red-500"}`} />
        {label} *
      </Label>
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={e => onValueChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={pinType === "start" ? "Search start location…" : "Search destination…"}
          className="flex-1"
        />
        <Button
          type="button" variant={isActive ? "default" : "outline"} size="sm"
          className="px-2 shrink-0" title={`Click map to set ${label}`}
          onClick={() => onActivePinChange(pinType)}
        >
          <MapPin className="h-3.5 w-3.5" />
        </Button>
      </div>
      {coords && (
        <p className="text-xs text-green-600 mt-0.5">
          📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </p>
      )}
      {focused && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {loading && <div className="p-2 text-xs text-muted-foreground">Searching…</div>}
          {results.map(r => (
            <button
              key={r.place_id} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 border-b last:border-0"
              onMouseDown={() => {
                onCoordSelect(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
                onValueChange(r.display_name);
                clear();
              }}
            >
              <div className="font-medium truncate">{r.display_name.split(",")[0]}</div>
              <div className="text-xs text-muted-foreground truncate">{r.display_name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main VehicleTrips page
// ═══════════════════════════════════════════════════════════════════════════════
export default function VehicleTrips() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const user = getUser();
  const canEdit = user?.role === "admin" || user?.role === "accountant";

  // ── Server data ──────────────────────────────────────────────────────────────
  const { data: vehicles = [], isLoading: loadingVehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    queryFn: () => apiRequest("GET", "/api/vehicles?includeInactive=true").then(r => r.json()),
  });
  const { data: fixedAssets = [] } = useQuery<FixedAsset[]>({
    queryKey: ["/api/fixed-assets"],
    queryFn: () => apiRequest("GET", "/api/fixed-assets").then(r => r.json()),
  });
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    queryFn: () => apiRequest("GET", "/api/employees").then(r => r.json()),
  });
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers").then(r => r.json()),
  });
  const { data: trips = [], isLoading: loadingTrips } = useQuery<VehicleTrip[]>({
    queryKey: ["/api/vehicle-trips"],
    queryFn: () => apiRequest("GET", "/api/vehicle-trips").then(r => r.json()),
  });

  // ── Vehicle dialog ────────────────────────────────────────────────────────────
  const [vehicleDialog, setVehicleDialog] = useState<"add" | "edit" | "view" | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleForm, setVehicleForm] = useState<typeof BLANK_VEHICLE>({ ...BLANK_VEHICLE });
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState("all");
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState("active");

  // ── Trip dialog ───────────────────────────────────────────────────────────────
  const [tripDialog, setTripDialog] = useState<"add" | "edit" | "view" | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<VehicleTrip | null>(null);
  const [tripForm, setTripForm] = useState<typeof BLANK_TRIP>({ ...BLANK_TRIP });
  const [tripSearch, setTripSearch] = useState("");
  const [tripStatusFilter, setTripStatusFilter] = useState("all");

  // Map state
  const [startCoords, setStartCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [endCoords, setEndCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [placingPin, setPlacingPin] = useState<"start" | "end">("start");
  const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [calcResult, setCalcResult] = useState<{ fuelCost: number; revenue: number; profit: number; profitPct: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  // ── Mutations ──────────────────────────────────────────────────────────────────
  const createVehicle = useMutation({
    mutationFn: (d: typeof BLANK_VEHICLE) => apiRequest("POST", "/api/vehicles", d).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/vehicles"] }); toast({ title: "Vehicle added" }); setVehicleDialog(null); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateVehicle = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/vehicles/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/vehicles"] }); toast({ title: "Vehicle updated" }); setVehicleDialog(null); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const createTrip = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/vehicle-trips", d).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vehicle-trips"] });
      toast({ title: "Trip created" });
      setTripDialog(null); resetTripState();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateTrip = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/vehicle-trips/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/vehicle-trips"] }); toast({ title: "Trip updated" }); setTripDialog(null); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Invoice data + state ──────────────────────────────────────────────────────
  const { data: tripInvoices = [], isLoading: loadingInvoices } = useQuery<VehicleTripInvoice[]>({
    queryKey: ["/api/vehicle-trip-invoices"],
    queryFn: () => apiRequest("GET", "/api/vehicle-trip-invoices").then(r => r.json()),
  });
  const { data: cashAccounts = [] } = useQuery<CashAccount[]>({
    queryKey: ["/api/cash-accounts"],
    queryFn: () => apiRequest("GET", "/api/cash-accounts").then(r => r.json()),
  });
  const { data: fuelLogs = [], isLoading: loadingFuelLogs } = useQuery<VehicleFuelLog[]>({
    queryKey: ["/api/vehicle-fuel-logs"],
    queryFn: () => apiRequest("GET", "/api/vehicle-fuel-logs").then(r => r.json()),
  });
  const { data: expenseCategories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/expense-categories"],
    queryFn: () => apiRequest("GET", "/api/expense-categories").then(r => r.json()),
  });
  const { data: maintenanceLogs = [], isLoading: loadingMaintenanceLogs } = useQuery<VehicleMaintenanceLog[]>({
    queryKey: ["/api/vehicle-maintenance-logs"],
    queryFn: () => apiRequest("GET", "/api/vehicle-maintenance-logs").then(r => r.json()),
  });
  const [invoiceDialog, setInvoiceDialog] = useState<"create" | "view" | "pay" | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<VehicleTripInvoice | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({
    tripId: "", customerId: "", invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "", subtotal: "", gstRate: "0", taxAmount: "0", grandTotal: "",
    distanceKm: "", ratePerKm: "", baseCharge: "0", notes: "",
  });
  const [payForm, setPayForm] = useState({
    amount: "", paymentDate: new Date().toISOString().slice(0, 10),
    method: "bank_transfer", cashAccountId: "", reference: "", notes: "",
  });
  const [invoiceFilter, setInvoiceFilter] = useState("all");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const createInvoice = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/vehicle-trip-invoices", d).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vehicle-trip-invoices"] });
      qc.invalidateQueries({ queryKey: ["/api/vehicle-trips"] });
      toast({ title: "Trip invoice created" });
      setInvoiceDialog(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const cancelInvoice = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/vehicle-trip-invoices/${id}/cancel`, { reason }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vehicle-trip-invoices"] });
      qc.invalidateQueries({ queryKey: ["/api/vehicle-trips"] });
      toast({ title: "Invoice cancelled" });
      setInvoiceDialog(null); setShowCancelConfirm(false); setCancelReason("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const recordTripPayment = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/customer-payments", d).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vehicle-trip-invoices"] });
      toast({ title: "Payment recorded" });
      setInvoiceDialog(null);
      setPayForm({ amount: "", paymentDate: new Date().toISOString().slice(0, 10), method: "bank_transfer", cashAccountId: "", reference: "", notes: "" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Fuel log state + mutations ────────────────────────────────────────────────
  const [fuelDialog, setFuelDialog] = useState<"add" | "post" | null>(null);
  const [selectedFuelLog, setSelectedFuelLog] = useState<VehicleFuelLog | null>(null);
  const [fuelForm, setFuelForm] = useState<typeof BLANK_FUEL_LOG>({ ...BLANK_FUEL_LOG });
  const [postFuelForm, setPostFuelForm] = useState<typeof BLANK_POST_FUEL>({ ...BLANK_POST_FUEL });
  const [fuelVehicleFilter, setFuelVehicleFilter] = useState("all");

  const createFuelLog = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/vehicle-fuel-logs", d).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vehicle-fuel-logs"] });
      toast({ title: "Fuel log added" });
      setFuelDialog(null);
      setFuelForm({ ...BLANK_FUEL_LOG });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const postFuelExpense = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest("POST", `/api/vehicle-fuel-logs/${id}/post-expense`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vehicle-fuel-logs"] });
      qc.invalidateQueries({ queryKey: ["/api/cash-accounts"] });
      toast({ title: "Posted to accounts", description: "Expense created and account balance updated." });
      setFuelDialog(null);
      setSelectedFuelLog(null);
      setPostFuelForm({ ...BLANK_POST_FUEL });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Maintenance log state + mutations ────────────────────────────────────────
  const [maintDialog, setMaintDialog] = useState<"add" | "post" | null>(null);
  const [selectedMaintLog, setSelectedMaintLog] = useState<VehicleMaintenanceLog | null>(null);
  const [maintForm, setMaintForm] = useState<typeof BLANK_MAINTENANCE_LOG>({ ...BLANK_MAINTENANCE_LOG });
  const [postMaintForm, setPostMaintForm] = useState<typeof BLANK_POST_MAINTENANCE>({ ...BLANK_POST_MAINTENANCE });
  const [maintVehicleFilter, setMaintVehicleFilter] = useState("all");

  const createMaintenanceLog = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/vehicle-maintenance-logs", d).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vehicle-maintenance-logs"] });
      toast({ title: "Maintenance log added" });
      setMaintDialog(null);
      setMaintForm({ ...BLANK_MAINTENANCE_LOG });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const postMaintenanceExpense = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest("POST", `/api/vehicle-maintenance-logs/${id}/post-expense`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vehicle-maintenance-logs"] });
      qc.invalidateQueries({ queryKey: ["/api/cash-accounts"] });
      toast({ title: "Posted to accounts", description: "Expense created and account balance updated." });
      setMaintDialog(null);
      setSelectedMaintLog(null);
      setPostMaintForm({ ...BLANK_POST_MAINTENANCE });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Auto-calculate fuel total when litres or rate changes
  const recalcFuel = (f: typeof fuelForm) => {
    const litres = parseFloat(f.litres) || 0;
    const rate = parseFloat(f.ratePerLitre) || 0;
    return { ...f, totalCost: (litres * rate).toFixed(2) };
  };

  // Auto-calculate invoice amounts when distance / rate / gstRate changes
  const recalcInvoice = (f: typeof invoiceForm) => {
    const dist = parseFloat(f.distanceKm) || 0;
    const rate = parseFloat(f.ratePerKm) || 0;
    const base = parseFloat(f.baseCharge) || 0;
    const gst  = parseFloat(f.gstRate) || 0;
    const sub  = dist * rate + base;
    const tax  = sub * gst / 100;
    return { ...f, subtotal: sub.toFixed(2), taxAmount: tax.toFixed(2), grandTotal: (sub + tax).toFixed(2) };
  };

  // ── Vehicle helpers ────────────────────────────────────────────────────────────
  const openAddVehicle = () => { setVehicleForm({ ...BLANK_VEHICLE }); setSelectedVehicle(null); setVehicleDialog("add"); };
  const openEditVehicle = (v: Vehicle) => {
    setSelectedVehicle(v);
    setVehicleForm({
      name: v.name, registrationNo: v.registrationNo, type: v.type,
      make: v.make ?? "", model: v.model ?? "", year: v.year ?? null,
      ownershipType: v.ownershipType, fuelType: v.fuelType,
      fuelEfficiency: v.fuelEfficiency ?? "", fuelRatePerLitre: v.fuelRatePerLitre ?? "",
      ratePerKm: v.ratePerKm ?? "", baseCharge: v.baseCharge ?? "0",
      insuranceExpiry: v.insuranceExpiry?.slice(0, 10) ?? "",
      fitnessExpiry: v.fitnessExpiry?.slice(0, 10) ?? "",
      permitExpiry: v.permitExpiry?.slice(0, 10) ?? "",
      currentOdometer: v.currentOdometer ?? "0",
      status: v.status, notes: v.notes ?? "",
      fixedAssetId: v.fixedAssetId ?? null,
    });
    setVehicleDialog("edit");
  };
  const saveVehicle = () => {
    const payload: any = { ...vehicleForm };
    ["fuelEfficiency", "fuelRatePerLitre", "ratePerKm", "baseCharge", "currentOdometer"]
      .forEach(k => { if (payload[k] === "") payload[k] = null; });
    ["insuranceExpiry", "fitnessExpiry", "permitExpiry"]
      .forEach(k => { if (payload[k] === "") payload[k] = null; });
    if (!payload.fixedAssetId) payload.fixedAssetId = null;
    if (vehicleDialog === "add") createVehicle.mutate(payload);
    else if (vehicleDialog === "edit" && selectedVehicle) updateVehicle.mutate({ id: selectedVehicle.id, data: payload });
  };

  // ── Trip helpers ───────────────────────────────────────────────────────────────
  const resetTripState = () => {
    setStartCoords(null); setEndCoords(null);
    setRouteGeometry([]); setCalcResult(null);
    setPlacingPin("start");
  };
  const openAddTrip = () => {
    setTripForm({ ...BLANK_TRIP, tripDate: new Date().toISOString().slice(0, 10) });
    setSelectedTrip(null); resetTripState(); setTripDialog("add");
  };
  const openEditTrip = (t: VehicleTrip) => {
    setSelectedTrip(t);
    setTripForm({
      customerId: t.customerId, vehicleId: t.vehicleId, driverId: t.driverId,
      startLocation: t.startLocation, endLocation: t.endLocation,
      distanceKm: t.distanceKm ?? "", startOdometer: t.startOdometer ?? "",
      endOdometer: t.endOdometer ?? "", tripDate: t.tripDate?.slice(0, 10) ?? "",
      returnTrip: t.returnTrip, purpose: t.purpose ?? "", notes: t.notes ?? "",
      startLat: t.startLat ? parseFloat(t.startLat) : null,
      startLng: t.startLng ? parseFloat(t.startLng) : null,
      endLat: t.endLat ? parseFloat(t.endLat) : null,
      endLng: t.endLng ? parseFloat(t.endLng) : null,
      estimatedDurationMinutes: t.estimatedDurationMinutes ?? null,
    });
    setStartCoords(t.startLat && t.startLng ? { lat: parseFloat(t.startLat), lng: parseFloat(t.startLng) } : null);
    setEndCoords(t.endLat && t.endLng ? { lat: parseFloat(t.endLat), lng: parseFloat(t.endLng) } : null);
    setRouteGeometry([]); setCalcResult(null); setTripDialog("edit");
  };

  // Map click handler
  const handleMapClick = useCallback((latlng: { lat: number; lng: number }, type: "start" | "end") => {
    if (type === "start") {
      setStartCoords(latlng);
      setTripForm(f => ({ ...f, startLat: latlng.lat, startLng: latlng.lng }));
      // Reverse geocode
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}`)
        .then(r => r.json())
        .then(d => setTripForm(f => ({ ...f, startLocation: d.display_name ?? f.startLocation })))
        .catch(() => {});
      setPlacingPin("end"); // auto-switch to end pin after setting start
    } else {
      setEndCoords(latlng);
      setTripForm(f => ({ ...f, endLat: latlng.lat, endLng: latlng.lng }));
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}`)
        .then(r => r.json())
        .then(d => setTripForm(f => ({ ...f, endLocation: d.display_name ?? f.endLocation })))
        .catch(() => {});
    }
  }, []);

  // Calculate route via OSRM
  const calculateRoute = useCallback(async (
    sLat?: number | null, sLng?: number | null,
    eLat?: number | null, eLng?: number | null
  ) => {
    const startLat = sLat ?? startCoords?.lat;
    const startLng_ = sLng ?? startCoords?.lng;
    const endLat = eLat ?? endCoords?.lat;
    const endLng_ = eLng ?? endCoords?.lng;
    if (!startLat || !startLng_ || !endLat || !endLng_) return;
    setRouteLoading(true);
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${startLng_},${startLat};${endLng_},${endLat}?overview=full&geometries=geojson`
      );
      const data = await res.json();
      if (data.code !== "Ok") throw new Error("Route not found");
      const route = data.routes[0];
      const distKm = parseFloat((route.distance / 1000).toFixed(2));
      const durationMin = Math.round(route.duration / 60);
      const geom: [number, number][] = route.geometry.coordinates;
      setRouteGeometry(geom);
      setTripForm(f => ({
        ...f,
        distanceKm: String(distKm),
        estimatedDurationMinutes: durationMin,
      }));
      toast({ title: `Route: ${distKm} km · ${fmtDuration(durationMin) ?? ""}` });
    } catch (e: any) {
      toast({ title: "Route calculation failed", description: e.message, variant: "destructive" });
    } finally {
      setRouteLoading(false); }
  }, [startCoords, endCoords, toast]);

  // Auto-calculate when both coords available
  useEffect(() => {
    if (startCoords && endCoords) calculateRoute();
  }, [startCoords, endCoords]); // eslint-disable-line

  // Recalculate financial estimates
  const recalcFinancials = useCallback(() => {
    const vehicle = vehicles.find(v => v.id === tripForm.vehicleId);
    if (!vehicle || !tripForm.distanceKm) return;
    const dist = parseFloat(tripForm.distanceKm) * (tripForm.returnTrip ? 2 : 1);
    const eff = parseFloat(vehicle.fuelEfficiency ?? "0");
    const fuelRate = parseFloat(vehicle.fuelRatePerLitre ?? "0");
    const rateKm = parseFloat(vehicle.ratePerKm ?? "0");
    const base = parseFloat(vehicle.baseCharge ?? "0");
    const fuelCost = eff > 0 ? (dist / eff) * fuelRate : 0;
    const revenue = dist * rateKm + base;
    const profit = revenue - fuelCost;
    setCalcResult({ fuelCost, revenue, profit, profitPct: revenue > 0 ? (profit / revenue) * 100 : 0 });
  }, [tripForm, vehicles]);

  useEffect(() => {
    if (tripForm.vehicleId && tripForm.distanceKm) recalcFinancials();
  }, [tripForm.vehicleId, tripForm.distanceKm, tripForm.returnTrip]); // eslint-disable-line

  // Get current location
  const getCurrentLocation = () => {
    if (!navigator.geolocation) { toast({ title: "Geolocation not supported", variant: "destructive" }); return; }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setStartCoords(coords);
        setTripForm(f => ({ ...f, startLat: coords.lat, startLng: coords.lng }));
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`)
          .then(r => r.json())
          .then(d => setTripForm(f => ({ ...f, startLocation: d.display_name ?? "Current location" })))
          .catch(() => setTripForm(f => ({ ...f, startLocation: "Current location" })));
        setGettingLocation(false);
        toast({ title: "Location set" });
      },
      () => { setGettingLocation(false); toast({ title: "Could not get location", variant: "destructive" }); }
    );
  };

  const saveTrip = () => {
    const payload: Record<string, unknown> = {
      ...tripForm,
      distanceKm: tripForm.distanceKm || null,
      startOdometer: tripForm.startOdometer || null,
      endOdometer: tripForm.endOdometer || null,
      fuelCostEstimate: calcResult ? String(calcResult.fuelCost.toFixed(2)) : null,
      revenueEstimate: calcResult ? String(calcResult.revenue.toFixed(2)) : null,
    };
    if (tripDialog === "add") createTrip.mutate(payload);
    else if (tripDialog === "edit" && selectedTrip) updateTrip.mutate({ id: selectedTrip.id, data: payload });
  };

  // ── Filtered data ──────────────────────────────────────────────────────────────
  const filteredVehicles = vehicles.filter(v => {
    const q = vehicleSearch.toLowerCase();
    const matchQ = !q || v.name.toLowerCase().includes(q) || v.registrationNo.toLowerCase().includes(q) ||
      (v.make ?? "").toLowerCase().includes(q) || (v.model ?? "").toLowerCase().includes(q);
    return matchQ &&
      (vehicleTypeFilter === "all" || v.type === vehicleTypeFilter) &&
      (vehicleStatusFilter === "all" || v.status === vehicleStatusFilter);
  });
  const filteredTrips = trips.filter(t => {
    const q = tripSearch.toLowerCase();
    const veh = vehicles.find(v => v.id === t.vehicleId);
    const cust = customers.find(c => c.id === t.customerId);
    const matchQ = !q || t.tripNumber.toLowerCase().includes(q) ||
      t.startLocation.toLowerCase().includes(q) || t.endLocation.toLowerCase().includes(q) ||
      (veh?.name ?? "").toLowerCase().includes(q) || (cust?.name ?? "").toLowerCase().includes(q);
    return matchQ && (tripStatusFilter === "all" || t.status === tripStatusFilter);
  });

  // ── Stats ────────────────────────────────────────────────────────────────────
  const activeVehicles = vehicles.filter(v => v.status === "active").length;
  const maintenanceVehicles = vehicles.filter(v => v.status === "maintenance").length;
  const expiringCount = vehicles.filter(v =>
    [v.insuranceExpiry, v.fitnessExpiry, v.permitExpiry].some(d => { const days = daysUntil(d); return days !== null && days >= 0 && days <= 30; })
  ).length;

  // ── Lookup helpers ─────────────────────────────────────────────────────────────
  const vehicleName = (id: string) => vehicles.find(v => v.id === id)?.name ?? "—";
  const customerName = (id: string) => customers.find(c => c.id === id)?.name ?? "—";
  const driverName = (id: string) => employees.find(e => e.id === id)?.name ?? "—";

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-green-100 text-green-800", maintenance: "bg-orange-100 text-orange-800",
      inactive: "bg-gray-100 text-gray-500", draft: "bg-gray-100 text-gray-600",
      confirmed: "bg-blue-100 text-blue-800", invoiced: "bg-purple-100 text-purple-800",
      completed: "bg-green-100 text-green-800", cancelled: "bg-red-100 text-red-800",
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>{status}</span>;
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Car className="h-6 w-6" /> Vehicle Trips</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Fleet management · Trip tracking · Service invoicing</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Active Vehicles", value: activeVehicles, icon: Car, color: "text-green-600" },
          { label: "Under Maintenance", value: maintenanceVehicles, icon: Wrench, color: "text-orange-500" },
          { label: "Expiry Alerts", value: expiringCount, icon: AlertTriangle, color: "text-red-500" },
          { label: "Total Trips", value: trips.length, icon: Navigation, color: "text-blue-600" },
          { label: "Active Trips", value: trips.filter(t => ["draft","confirmed"].includes(t.status)).length, icon: MapPin, color: "text-purple-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">{label}</p><p className={`text-2xl font-bold ${color}`}>{value}</p></div>
              <Icon className={`h-8 w-8 opacity-20 ${color}`} />
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="vehicles">
        <TabsList className="grid w-full grid-cols-6 max-w-3xl">
          <TabsTrigger value="vehicles"><Car className="h-3.5 w-3.5 mr-1.5" />Vehicles</TabsTrigger>
          <TabsTrigger value="trips"><Navigation className="h-3.5 w-3.5 mr-1.5" />Trips</TabsTrigger>
          <TabsTrigger value="invoices"><ReceiptText className="h-3.5 w-3.5 mr-1.5" />Invoices</TabsTrigger>
          <TabsTrigger value="fuel"><Fuel className="h-3.5 w-3.5 mr-1.5" />Fuel Log</TabsTrigger>
          <TabsTrigger value="maintenance"><Wrench className="h-3.5 w-3.5 mr-1.5" />Maintenance</TabsTrigger>
          <TabsTrigger value="reports"><FileBarChart2 className="h-3.5 w-3.5 mr-1.5" />Reports</TabsTrigger>
        </TabsList>

        {/* ── VEHICLES TAB ──────────────────────────────────────────────────────── */}
        <TabsContent value="vehicles" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search vehicles…" className="pl-8 w-56"
                  value={vehicleSearch} onChange={e => setVehicleSearch(e.target.value)} />
              </div>
              <Select value={vehicleTypeFilter} onValueChange={setVehicleTypeFilter}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {["car","suv","pickup","truck","van","bus","other"].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={vehicleStatusFilter} onValueChange={setVehicleStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canEdit && <Button onClick={openAddVehicle} className="gap-1.5"><Plus className="h-4 w-4" />Add Vehicle</Button>}
          </div>

          {loadingVehicles ? (
            <div className="text-center text-muted-foreground py-12">Loading…</div>
          ) : filteredVehicles.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Car className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No vehicles found</p>
              {canEdit && <Button variant="outline" className="mt-3 gap-1.5" onClick={openAddVehicle}><Plus className="h-4 w-4" />Add first vehicle</Button>}
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Reg No.</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Fuel</TableHead>
                    <TableHead>Rate/KM</TableHead>
                    <TableHead>Odometer</TableHead>
                    <TableHead>Fixed Asset</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Alerts</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVehicles.map(v => {
                    const alerts = [
                      expiryBadge("Insurance", v.insuranceExpiry),
                      expiryBadge("Fitness", v.fitnessExpiry),
                      expiryBadge("Permit", v.permitExpiry),
                    ].filter(Boolean);
                    const linkedAsset = fixedAssets.find(a => a.id === v.fixedAssetId);
                    return (
                      <TableRow key={v.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-medium">{v.name}</div>
                          <div className="text-xs text-muted-foreground">{[v.make, v.model, v.year].filter(Boolean).join(" ")}</div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{v.registrationNo}</TableCell>
                        <TableCell className="capitalize">{v.type}</TableCell>
                        <TableCell>
                          <div className="text-sm capitalize">{v.fuelType}</div>
                          <div className="text-xs text-muted-foreground">{v.fuelEfficiency ? `${v.fuelEfficiency} km/L` : "—"}</div>
                        </TableCell>
                        <TableCell>{v.ratePerKm ? `₹${v.ratePerKm}/km` : "—"}</TableCell>
                        <TableCell>{v.currentOdometer ? `${Number(v.currentOdometer).toLocaleString("en-IN")} km` : "—"}</TableCell>
                        <TableCell>
                          {linkedAsset
                            ? <span className="text-xs text-blue-600">{linkedAsset.name}</span>
                            : <span className="text-xs text-muted-foreground">{v.ownershipType === "owned" ? "Not linked" : "—"}</span>}
                        </TableCell>
                        <TableCell>{statusBadge(v.status)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">{alerts.length > 0 ? alerts : <span className="text-xs text-muted-foreground">—</span>}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditVehicle(v)}><Edit className="h-3.5 w-3.5" /></Button>
                            {canEdit && v.status !== "inactive" && (
                              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700"
                                onClick={() => { if (confirm(`Disable ${v.name}?`)) updateVehicle.mutate({ id: v.id, data: { status: "inactive" } }); }}>
                                Disable
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── TRIPS TAB ─────────────────────────────────────────────────────────── */}
        <TabsContent value="trips" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search trips…" className="pl-8 w-56"
                  value={tripSearch} onChange={e => setTripSearch(e.target.value)} />
              </div>
              <Select value={tripStatusFilter} onValueChange={setTripStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {["draft","confirmed","invoiced","completed","cancelled"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {canEdit && <Button onClick={openAddTrip} className="gap-1.5"><Plus className="h-4 w-4" />New Trip</Button>}
          </div>

          {loadingTrips ? (
            <div className="text-center text-muted-foreground py-12">Loading…</div>
          ) : filteredTrips.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Navigation className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No trips found</p>
              {canEdit && <Button variant="outline" className="mt-3 gap-1.5" onClick={openAddTrip}><Plus className="h-4 w-4" />Create first trip</Button>}
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trip No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Vehicle / Driver</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Revenue Est.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrips.map(t => (
                    <TableRow key={t.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-sm font-medium whitespace-nowrap">{t.tripNumber}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(t.tripDate)}</TableCell>
                      <TableCell>{customerName(t.customerId)}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{vehicleName(t.vehicleId)}</div>
                        <div className="text-xs text-muted-foreground">{driverName(t.driverId)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{t.startLocation.split(",")[0]} → {t.endLocation.split(",")[0]}</div>
                        {t.returnTrip && <span className="text-xs text-blue-600">↩ Return</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{t.distanceKm ? `${t.distanceKm} km` : "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {t.estimatedDurationMinutes
                          ? <span className="flex items-center gap-1 text-sm"><Clock className="h-3 w-3 text-muted-foreground" />{fmtDuration(t.estimatedDurationMinutes)}</span>
                          : "—"}
                      </TableCell>
                      <TableCell>{t.revenueEstimate ? fmt(t.revenueEstimate) : "—"}</TableCell>
                      <TableCell>{statusBadge(t.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditTrip(t)}><Eye className="h-3.5 w-3.5" /></Button>
                          {canEdit && t.status === "draft" && (
                            <Button variant="outline" size="sm" className="text-xs"
                              onClick={() => updateTrip.mutate({ id: t.id, data: { status: "confirmed" } })}>Confirm</Button>
                          )}
                          {canEdit && t.status === "confirmed" && (
                            <Button variant="outline" size="sm" className="text-xs"
                              onClick={() => updateTrip.mutate({ id: t.id, data: { status: "completed" } })}>Complete</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── INVOICES TAB ─────────────────────────────────────────────────────── */}
        <TabsContent value="invoices" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <Select value={invoiceFilter} onValueChange={setInvoiceFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canEdit && (
              <Button onClick={() => {
                setInvoiceForm({ tripId: "", customerId: "", invoiceDate: new Date().toISOString().slice(0, 10), dueDate: "", subtotal: "", gstRate: "0", taxAmount: "0", grandTotal: "", distanceKm: "", ratePerKm: "", baseCharge: "0", notes: "" });
                setInvoiceDialog("create");
              }}>
                <Plus className="h-4 w-4 mr-1.5" /> New Trip Invoice
              </Button>
            )}
          </div>

          {loadingInvoices ? (
            <p className="text-muted-foreground text-sm">Loading invoices…</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Trip</TableHead>
                    <TableHead className="text-right">Grand Total</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tripInvoices
                    .filter(inv => invoiceFilter === "all" || inv.status === invoiceFilter)
                    .map(inv => {
                      const trip = trips.find(t => t.id === inv.tripId);
                      const cust = customers.find(c => c.id === inv.customerId);
                      const outstanding = inv.outstanding ?? Math.max(0, Number(inv.grandTotal) - Number(inv.creditedAmount));
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-sm">{fmtDate(inv.invoiceDate)}</TableCell>
                          <TableCell className="text-sm">{cust?.name ?? inv.customerId}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{trip?.tripNumber ?? inv.tripId.slice(0, 8)}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(inv.grandTotal)}</TableCell>
                          <TableCell className={`text-right font-medium ${outstanding > 0 ? "text-orange-600" : "text-green-600"}`}>
                            {fmt(outstanding)}
                          </TableCell>
                          <TableCell>{statusBadge(inv.status)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                onClick={() => { setSelectedInvoice({ ...inv, outstanding }); setInvoiceDialog("view"); }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {canEdit && inv.status !== "cancelled" && inv.status !== "paid" && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-700"
                                  onClick={() => {
                                    setSelectedInvoice({ ...inv, outstanding });
                                    setPayForm({ amount: outstanding.toFixed(2), paymentDate: new Date().toISOString().slice(0, 10), method: "bank_transfer", cashAccountId: "", reference: "", notes: "" });
                                    setInvoiceDialog("pay");
                                  }}>
                                  Record Payment
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  {tripInvoices.filter(inv => invoiceFilter === "all" || inv.status === invoiceFilter).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No invoices found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Fuel Log Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="fuel" className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Select value={fuelVehicleFilter} onValueChange={setFuelVehicleFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All Vehicles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vehicles</SelectItem>
                  {vehicles.filter(v => v.status === "active").map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canEdit && (
              <Button className="gap-1.5" onClick={() => { setFuelForm({ ...BLANK_FUEL_LOG }); setFuelDialog("add"); }}>
                <Plus className="h-4 w-4" />Add Fuel Log
              </Button>
            )}
          </div>

          {loadingFuelLogs ? (
            <div className="text-center text-muted-foreground py-12">Loading…</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Trip</TableHead>
                    <TableHead className="text-right">Litres</TableHead>
                    <TableHead className="text-right">Rate/L</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fuelLogs
                    .filter(fl => fuelVehicleFilter === "all" || fl.vehicleId === fuelVehicleFilter)
                    .map(fl => (
                      <TableRow key={fl.id} className="hover:bg-muted/30">
                        <TableCell className="whitespace-nowrap">{fmtDate(fl.logDate)}</TableCell>
                        <TableCell className="font-medium">{vehicleName(fl.vehicleId)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {fl.tripId ? (trips.find(t => t.id === fl.tripId)?.tripNumber ?? "—") : "—"}
                        </TableCell>
                        <TableCell className="text-right">{fl.litres} L</TableCell>
                        <TableCell className="text-right">₹{parseFloat(fl.ratePerLitre).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(fl.totalCost)}</TableCell>
                        <TableCell>
                          {fl.postedToAccounts ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              ✓ Posted {fl.postedAt ? fmtDate(fl.postedAt) : ""}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              Pending
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {canEdit && !fl.postedToAccounts && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => { setSelectedFuelLog(fl); setPostFuelForm({ ...BLANK_POST_FUEL }); setFuelDialog("post"); }}>
                              Post to Accounts
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  {fuelLogs.filter(fl => fuelVehicleFilter === "all" || fl.vehicleId === fuelVehicleFilter).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        <Fuel className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        <p className="font-medium">No fuel logs yet</p>
                        {canEdit && <Button variant="outline" size="sm" className="mt-2 gap-1" onClick={() => { setFuelForm({ ...BLANK_FUEL_LOG }); setFuelDialog("add"); }}><Plus className="h-4 w-4" />Add first entry</Button>}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Add Fuel Log Dialog */}
          <Dialog open={fuelDialog === "add"} onOpenChange={o => !o && setFuelDialog(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add Fuel Log</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label>Vehicle *</Label>
                  <Select value={fuelForm.vehicleId} onValueChange={v => setFuelForm(f => ({ ...f, vehicleId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                    <SelectContent>{vehicles.filter(v => v.status === "active").map(v => <SelectItem key={v.id} value={v.id}>{v.name} ({v.registrationNo})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Trip (optional)</Label>
                  <Select value={fuelForm.tripId || "none"} onValueChange={v => setFuelForm(f => ({ ...f, tripId: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="No trip linked" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No trip linked</SelectItem>
                      {trips.filter(t => !["cancelled"].includes(t.status) && (!fuelForm.vehicleId || t.vehicleId === fuelForm.vehicleId)).map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.tripNumber} — {t.startLocation} → {t.endLocation}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date *</Label>
                  <Input type="date" value={fuelForm.logDate} onChange={e => setFuelForm(f => ({ ...f, logDate: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Litres *</Label>
                    <Input type="number" step="0.01" placeholder="45.00" value={fuelForm.litres}
                      onChange={e => setFuelForm(f => recalcFuel({ ...f, litres: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Rate/Litre (₹) *</Label>
                    <Input type="number" step="0.01" placeholder="105.00" value={fuelForm.ratePerLitre}
                      onChange={e => setFuelForm(f => recalcFuel({ ...f, ratePerLitre: e.target.value }))} />
                  </div>
                </div>
                <div className="flex justify-between items-center py-1 px-3 bg-muted rounded text-sm font-medium">
                  <span>Total Cost</span>
                  <span>{fmt(fuelForm.totalCost || "0")}</span>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea rows={2} placeholder="Optional notes…" value={fuelForm.notes} onChange={e => setFuelForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFuelDialog(null)}>Cancel</Button>
                <Button
                  disabled={createFuelLog.isPending || !fuelForm.vehicleId || !fuelForm.logDate || !fuelForm.litres || !fuelForm.ratePerLitre}
                  onClick={() => {
                    const payload: any = { ...fuelForm, tripId: fuelForm.tripId || null };
                    createFuelLog.mutate(payload);
                  }}>
                  {createFuelLog.isPending ? "Saving…" : "Save Fuel Log"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Post to Accounts Dialog */}
          <Dialog open={fuelDialog === "post"} onOpenChange={o => !o && setFuelDialog(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Post to Accounts</DialogTitle></DialogHeader>
              {selectedFuelLog && (
                <p className="text-sm text-muted-foreground -mt-1">
                  {vehicleName(selectedFuelLog.vehicleId)} · {fmtDate(selectedFuelLog.logDate)} · {selectedFuelLog.litres} L · <strong>{fmt(selectedFuelLog.totalCost)}</strong>
                </p>
              )}
              <div className="space-y-3 py-2">
                <div>
                  <Label>Expense Category *</Label>
                  <Select value={postFuelForm.categoryId} onValueChange={v => setPostFuelForm(f => ({ ...f, categoryId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>{expenseCategories.filter(c => c.isActive).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cash / Bank Account *</Label>
                  <Select value={postFuelForm.cashAccountId} onValueChange={v => setPostFuelForm(f => ({ ...f, cashAccountId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>{cashAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Select value={postFuelForm.paymentMethod} onValueChange={v => setPostFuelForm(f => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["cash","upi","card","bank_transfer","cheque"].map(m => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea rows={2} placeholder="Optional notes…" value={postFuelForm.notes} onChange={e => setPostFuelForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Expense date will be set to the fuel log date ({selectedFuelLog ? fmtDate(selectedFuelLog.logDate) : ""}), not today.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFuelDialog(null)}>Cancel</Button>
                <Button
                  disabled={postFuelExpense.isPending || !postFuelForm.categoryId || !postFuelForm.cashAccountId}
                  onClick={() => {
                    if (!selectedFuelLog) return;
                    postFuelExpense.mutate({ id: selectedFuelLog.id, data: postFuelForm });
                  }}>
                  {postFuelExpense.isPending ? "Posting…" : "Post to Accounts"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Maintenance Log Tab — Phase 6 */}
        <TabsContent value="maintenance" className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Select value={maintVehicleFilter} onValueChange={setMaintVehicleFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All Vehicles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vehicles</SelectItem>
                  {vehicles.filter(v => v.status === "active").map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canEdit && (
              <Button className="gap-1.5" onClick={() => { setMaintForm({ ...BLANK_MAINTENANCE_LOG }); setMaintDialog("add"); }}>
                <Plus className="h-4 w-4" />Add Maintenance Log
              </Button>
            )}
          </div>

          {loadingMaintenanceLogs ? (
            <div className="text-center text-muted-foreground py-12">Loading…</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Service Type</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maintenanceLogs
                    .filter(ml => maintVehicleFilter === "all" || ml.vehicleId === maintVehicleFilter)
                    .map(ml => (
                      <TableRow key={ml.id} className="hover:bg-muted/30">
                        <TableCell className="whitespace-nowrap">{fmtDate(ml.serviceDate)}</TableCell>
                        <TableCell className="font-medium">{vehicleName(ml.vehicleId)}</TableCell>
                        <TableCell className="capitalize">{SERVICE_TYPES.find(s => s.value === ml.serviceType)?.label ?? ml.serviceType}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{ml.vendorName ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(ml.cost)}</TableCell>
                        <TableCell>
                          {ml.postedToAccounts ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              ✓ Posted {ml.postedAt ? fmtDate(ml.postedAt) : ""}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              Pending
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {canEdit && !ml.postedToAccounts && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => { setSelectedMaintLog(ml); setPostMaintForm({ ...BLANK_POST_MAINTENANCE }); setMaintDialog("post"); }}>
                              Post to Accounts
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  {maintenanceLogs.filter(ml => maintVehicleFilter === "all" || ml.vehicleId === maintVehicleFilter).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        <Wrench className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        <p className="font-medium">No maintenance logs yet</p>
                        {canEdit && <Button variant="outline" size="sm" className="mt-2 gap-1" onClick={() => { setMaintForm({ ...BLANK_MAINTENANCE_LOG }); setMaintDialog("add"); }}><Plus className="h-4 w-4" />Add first entry</Button>}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Add Maintenance Log Dialog */}
          <Dialog open={maintDialog === "add"} onOpenChange={o => !o && setMaintDialog(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add Maintenance Log</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label>Vehicle *</Label>
                  <Select value={maintForm.vehicleId} onValueChange={v => setMaintForm(f => ({ ...f, vehicleId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                    <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name} ({v.registrationNo})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Service Date *</Label>
                  <Input type="date" value={maintForm.serviceDate} onChange={e => setMaintForm(f => ({ ...f, serviceDate: e.target.value }))} />
                </div>
                <div>
                  <Label>Service Type *</Label>
                  <Select value={maintForm.serviceType} onValueChange={v => setMaintForm(f => ({ ...f, serviceType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SERVICE_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Vendor / Workshop</Label>
                  <Input placeholder="Optional" value={maintForm.vendorName} onChange={e => setMaintForm(f => ({ ...f, vendorName: e.target.value }))} />
                </div>
                <div>
                  <Label>Cost (₹) *</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={maintForm.cost} onChange={e => setMaintForm(f => ({ ...f, cost: e.target.value }))} />
                </div>
                <div>
                  <Label>Current Odometer (km)</Label>
                  <Input type="number" step="1" placeholder="Optional" value={maintForm.odometerReading} onChange={e => setMaintForm(f => ({ ...f, odometerReading: e.target.value }))} />
                </div>
                <div>
                  <Label>Next Service Date</Label>
                  <Input type="date" value={maintForm.nextServiceDate} onChange={e => setMaintForm(f => ({ ...f, nextServiceDate: e.target.value }))} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea rows={2} placeholder="Optional notes…" value={maintForm.notes} onChange={e => setMaintForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMaintDialog(null)}>Cancel</Button>
                <Button
                  disabled={createMaintenanceLog.isPending || !maintForm.vehicleId || !maintForm.serviceDate || !maintForm.serviceType || !maintForm.cost}
                  onClick={() => {
                    const payload: any = {
                      ...maintForm,
                      vendorName: maintForm.vendorName || null,
                      odometerReading: maintForm.odometerReading || null,
                      nextServiceDate: maintForm.nextServiceDate || null,
                    };
                    createMaintenanceLog.mutate(payload);
                  }}>
                  {createMaintenanceLog.isPending ? "Saving…" : "Save Maintenance Log"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Post to Accounts Dialog */}
          <Dialog open={maintDialog === "post"} onOpenChange={o => !o && setMaintDialog(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Post to Accounts</DialogTitle></DialogHeader>
              {selectedMaintLog && (
                <p className="text-sm text-muted-foreground -mt-1">
                  {vehicleName(selectedMaintLog.vehicleId)} · {SERVICE_TYPES.find(s => s.value === selectedMaintLog.serviceType)?.label ?? selectedMaintLog.serviceType} · {fmtDate(selectedMaintLog.serviceDate)} · <strong>{fmt(selectedMaintLog.cost)}</strong>
                </p>
              )}
              <div className="space-y-3 py-2">
                <div>
                  <Label>Expense Category *</Label>
                  <Select value={postMaintForm.categoryId} onValueChange={v => setPostMaintForm(f => ({ ...f, categoryId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>{expenseCategories.filter(c => c.isActive).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cash / Bank Account *</Label>
                  <Select value={postMaintForm.cashAccountId} onValueChange={v => setPostMaintForm(f => ({ ...f, cashAccountId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>{cashAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Select value={postMaintForm.paymentMethod} onValueChange={v => setPostMaintForm(f => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["cash","upi","card","bank_transfer","cheque"].map(m => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea rows={2} placeholder="Optional notes…" value={postMaintForm.notes} onChange={e => setPostMaintForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Expense date will be set to the maintenance log date ({selectedMaintLog ? fmtDate(selectedMaintLog.serviceDate) : ""}), not today.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMaintDialog(null)}>Cancel</Button>
                <Button
                  disabled={postMaintenanceExpense.isPending || !postMaintForm.categoryId || !postMaintForm.cashAccountId}
                  onClick={() => {
                    if (!selectedMaintLog) return;
                    postMaintenanceExpense.mutate({ id: selectedMaintLog.id, data: postMaintForm });
                  }}>
                  {postMaintenanceExpense.isPending ? "Posting…" : "Post to Accounts"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Reports stub — Phase 7 */}
        <TabsContent value="reports" className="mt-4">
          <Card><CardContent className="py-16 text-center">
            <FileBarChart2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-semibold text-lg">Vehicle Reports</p>
            <p className="text-muted-foreground text-sm mt-1">Phase 7 — Revenue per vehicle, profit per driver, monthly P&L and more.</p>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* ══════════════════════════════════════════════════════════════════════════
          VEHICLE ADD / EDIT DIALOG
      ══════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={vehicleDialog !== null} onOpenChange={o => { if (!o) setVehicleDialog(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{vehicleDialog === "add" ? "Add Vehicle" : "Edit Vehicle"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Vehicle Name *</Label>
              <Input placeholder="e.g. Innova – AS01AB1234"
                value={vehicleForm.name} onChange={e => setVehicleForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Registration No. *</Label>
              <Input placeholder="AS01AB1234"
                value={vehicleForm.registrationNo} onChange={e => setVehicleForm(f => ({ ...f, registrationNo: e.target.value }))} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={vehicleForm.type} onValueChange={v => setVehicleForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["car","suv","pickup","truck","van","bus","other"].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Make</Label><Input placeholder="Toyota" value={vehicleForm.make ?? ""} onChange={e => setVehicleForm(f => ({ ...f, make: e.target.value }))} /></div>
            <div><Label>Model</Label><Input placeholder="Innova Crysta" value={vehicleForm.model ?? ""} onChange={e => setVehicleForm(f => ({ ...f, model: e.target.value }))} /></div>
            <div><Label>Year</Label><Input type="number" placeholder="2022" value={vehicleForm.year ?? ""} onChange={e => setVehicleForm(f => ({ ...f, year: e.target.value ? parseInt(e.target.value) : null }))} /></div>
            <div>
              <Label>Ownership Type</Label>
              <Select value={vehicleForm.ownershipType} onValueChange={v => setVehicleForm(f => ({ ...f, ownershipType: v, fixedAssetId: v !== "owned" ? null : f.fixedAssetId }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owned">Owned</SelectItem>
                  <SelectItem value="hired">Hired</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fuel Type</Label>
              <Select value={vehicleForm.fuelType} onValueChange={v => setVehicleForm(f => ({ ...f, fuelType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="petrol">Petrol</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="cng">CNG</SelectItem>
                  <SelectItem value="ev">EV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Fuel Efficiency (km/L)</Label><Input type="number" step="0.1" placeholder="12.5" value={vehicleForm.fuelEfficiency ?? ""} onChange={e => setVehicleForm(f => ({ ...f, fuelEfficiency: e.target.value }))} /></div>
            <div><Label>Fuel Rate per Litre (₹)</Label><Input type="number" step="0.01" placeholder="105.00" value={vehicleForm.fuelRatePerLitre ?? ""} onChange={e => setVehicleForm(f => ({ ...f, fuelRatePerLitre: e.target.value }))} /></div>
            <div><Label>Rate per KM (₹)</Label><Input type="number" step="0.01" placeholder="50.00" value={vehicleForm.ratePerKm ?? ""} onChange={e => setVehicleForm(f => ({ ...f, ratePerKm: e.target.value }))} /></div>
            <div><Label>Base Charge (₹)</Label><Input type="number" step="0.01" placeholder="0.00" value={vehicleForm.baseCharge ?? ""} onChange={e => setVehicleForm(f => ({ ...f, baseCharge: e.target.value }))} /></div>
            <div><Label>Current Odometer (km)</Label><Input type="number" step="1" value={vehicleForm.currentOdometer ?? ""} onChange={e => setVehicleForm(f => ({ ...f, currentOdometer: e.target.value }))} /></div>
            <div><Label>Insurance Expiry</Label><Input type="date" value={vehicleForm.insuranceExpiry ?? ""} onChange={e => setVehicleForm(f => ({ ...f, insuranceExpiry: e.target.value }))} /></div>
            <div><Label>Fitness Expiry</Label><Input type="date" value={vehicleForm.fitnessExpiry ?? ""} onChange={e => setVehicleForm(f => ({ ...f, fitnessExpiry: e.target.value }))} /></div>
            <div><Label>Permit Expiry</Label><Input type="date" value={vehicleForm.permitExpiry ?? ""} onChange={e => setVehicleForm(f => ({ ...f, permitExpiry: e.target.value }))} /></div>
            <div>
              <Label>Status</Label>
              <Select value={vehicleForm.status} onValueChange={v => setVehicleForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="maintenance">Under Maintenance</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Fixed Asset link — only for owned vehicles */}
            {vehicleForm.ownershipType === "owned" && (
              <div className="col-span-2">
                <Label>Link to Fixed Asset <span className="text-muted-foreground text-xs">(optional — for Balance Sheet depreciation)</span></Label>
                <Select
                  value={vehicleForm.fixedAssetId ?? "__none__"}
                  onValueChange={v => setVehicleForm(f => ({ ...f, fixedAssetId: v === "__none__" ? null : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select fixed asset…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {fixedAssets.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name} <span className="text-muted-foreground text-xs">({a.category})</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Linking adds this vehicle to the Balance Sheet under Fixed Assets with automatic depreciation.</p>
              </div>
            )}
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={vehicleForm.notes ?? ""} onChange={e => setVehicleForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVehicleDialog(null)}>Cancel</Button>
            <Button onClick={saveVehicle} disabled={createVehicle.isPending || updateVehicle.isPending || !vehicleForm.name || !vehicleForm.registrationNo}>
              {vehicleDialog === "add" ? "Add Vehicle" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════════
          TRIP CREATE / EDIT — Wide two-column Dialog with Leaflet map
      ══════════════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={tripDialog !== null}
        onOpenChange={o => { if (!o) { setTripDialog(null); resetTripState(); } }}
      >
        <DialogContent className="max-w-5xl w-full p-0 overflow-hidden" style={{ maxHeight: "90vh" }}>
          <div className="flex flex-col h-full" style={{ maxHeight: "90vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Route className="h-5 w-5" />
                {tripDialog === "add" ? "New Trip" : tripDialog === "edit" ? `Edit Trip` : `Trip ${selectedTrip?.tripNumber}`}
              </h2>
            </div>

            {/* Two-column body */}
            <div className="flex flex-1 overflow-hidden">
              {/* LEFT — Map */}
              <div className="w-[55%] relative bg-gray-100 flex flex-col" style={{ minHeight: 480 }}>
                {/* Map controls overlay */}
                <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2">
                  <Button
                    size="sm" variant="default"
                    className="bg-white text-gray-900 hover:bg-gray-50 shadow-md gap-1.5 text-xs border"
                    onClick={getCurrentLocation}
                    disabled={gettingLocation}
                  >
                    {gettingLocation ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Locate className="h-3.5 w-3.5" />}
                    {gettingLocation ? "Getting…" : "My Location"}
                  </Button>
                  <div className="bg-white rounded-md shadow-md border text-xs p-2 space-y-1">
                    <button
                      className={`flex items-center gap-1.5 w-full px-1 py-0.5 rounded ${placingPin === "start" ? "bg-green-50 text-green-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                      onClick={() => setPlacingPin("start")}
                    >
                      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      Set Start
                    </button>
                    <button
                      className={`flex items-center gap-1.5 w-full px-1 py-0.5 rounded ${placingPin === "end" ? "bg-red-50 text-red-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                      onClick={() => setPlacingPin("end")}
                    >
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                      Set End
                    </button>
                  </div>
                </div>

                {/* Route info overlay */}
                {(tripForm.distanceKm || tripForm.estimatedDurationMinutes) && (
                  <div className="absolute bottom-3 left-3 z-[1000] bg-white rounded-md shadow-md border px-3 py-2 flex gap-4 text-sm">
                    {tripForm.distanceKm && (
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Navigation className="h-3.5 w-3.5 text-blue-600" />
                        {tripForm.distanceKm} km
                      </span>
                    )}
                    {tripForm.estimatedDurationMinutes && (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {fmtDuration(tripForm.estimatedDurationMinutes)}
                      </span>
                    )}
                    {routeLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />}
                  </div>
                )}

                <MapPanel
                  startCoords={startCoords}
                  endCoords={endCoords}
                  onMapClick={handleMapClick}
                  placingPin={placingPin}
                  routeGeometry={routeGeometry}
                  isOpen={tripDialog !== null}
                />
              </div>

              {/* RIGHT — Form */}
              <div className="w-[45%] overflow-y-auto border-l">
                <div className="p-5 space-y-4">
                  {/* Customer, Vehicle, Driver */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label>Customer *</Label>
                      <Select value={tripForm.customerId} onValueChange={v => setTripForm(f => ({ ...f, customerId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                        <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Vehicle *</Label>
                      <Select value={tripForm.vehicleId} onValueChange={v => setTripForm(f => ({ ...f, vehicleId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                        <SelectContent>
                          {vehicles.filter(v => v.status === "active").map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Driver *</Label>
                      <Select value={tripForm.driverId} onValueChange={v => setTripForm(f => ({ ...f, driverId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                        <SelectContent>
                          {employees.filter(e => e.isActive).map(e => (
                            <SelectItem key={e.id} value={e.id}>{e.name} · {e.designation}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label>Trip Date *</Label>
                      <Input type="date" value={tripForm.tripDate} onChange={e => setTripForm(f => ({ ...f, tripDate: e.target.value }))} />
                    </div>
                  </div>

                  <hr className="my-1" />

                  {/* Location fields with map integration */}
                  <p className="text-xs text-muted-foreground">Click the map to drop pins, or search addresses below.</p>
                  <LocationField
                    label="Start Location" value={tripForm.startLocation}
                    onValueChange={v => setTripForm(f => ({ ...f, startLocation: v }))}
                    onCoordSelect={(lat, lng, address) => {
                      setStartCoords({ lat, lng });
                      setTripForm(f => ({ ...f, startLat: lat, startLng: lng, startLocation: address }));
                    }}
                    pinType="start" activePinType={placingPin} onActivePinChange={setPlacingPin}
                    coords={startCoords}
                  />
                  <LocationField
                    label="End Location" value={tripForm.endLocation}
                    onValueChange={v => setTripForm(f => ({ ...f, endLocation: v }))}
                    onCoordSelect={(lat, lng, address) => {
                      setEndCoords({ lat, lng });
                      setTripForm(f => ({ ...f, endLat: lat, endLng: lng, endLocation: address }));
                    }}
                    pinType="end" activePinType={placingPin} onActivePinChange={setPlacingPin}
                    coords={endCoords}
                  />

                  {/* Distance — manual override */}
                  <div>
                    <Label className="flex items-center justify-between">
                      Distance (km)
                      <Button variant="ghost" size="sm" className="h-5 text-xs text-blue-600 p-0 gap-1"
                        onClick={() => calculateRoute()} disabled={routeLoading || !startCoords || !endCoords}>
                        {routeLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Route className="h-3 w-3" />}
                        Recalculate
                      </Button>
                    </Label>
                    <Input type="number" step="0.1" placeholder="Auto-calculated from map"
                      value={tripForm.distanceKm} onChange={e => setTripForm(f => ({ ...f, distanceKm: e.target.value }))} />
                    {tripForm.estimatedDurationMinutes && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Estimated: {fmtDuration(tripForm.estimatedDurationMinutes)}
                      </p>
                    )}
                  </div>

                  <hr className="my-1" />

                  {/* Odometers + Return Trip */}
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Start Odometer (km)</Label><Input type="number" step="1" placeholder="optional" value={tripForm.startOdometer} onChange={e => setTripForm(f => ({ ...f, startOdometer: e.target.value }))} /></div>
                    <div><Label>End Odometer (km)</Label><Input type="number" step="1" placeholder="optional" value={tripForm.endOdometer} onChange={e => setTripForm(f => ({ ...f, endOdometer: e.target.value }))} /></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="returnTrip" checked={tripForm.returnTrip}
                      onChange={e => setTripForm(f => ({ ...f, returnTrip: e.target.checked }))}
                      className="h-4 w-4 rounded border" />
                    <Label htmlFor="returnTrip" className="cursor-pointer">Return Trip (distance × 2)</Label>
                  </div>
                  <div>
                    <Label>Purpose</Label>
                    <Input placeholder="Delivery, site visit…" value={tripForm.purpose} onChange={e => setTripForm(f => ({ ...f, purpose: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea rows={2} value={tripForm.notes} onChange={e => setTripForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>

                  {/* Financial estimates */}
                  {calcResult && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Financial Estimate</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "Fuel Cost", value: calcResult.fuelCost, color: "text-red-600" },
                          { label: "Revenue", value: calcResult.revenue, color: "text-green-700" },
                          { label: "Profit", value: calcResult.profit, color: calcResult.profit >= 0 ? "text-green-700" : "text-red-600" },
                          { label: "Margin", value: null, display: `${calcResult.profitPct.toFixed(1)}%`, color: calcResult.profitPct >= 0 ? "text-green-700" : "text-red-600" },
                        ].map(({ label, value, display, color }) => (
                          <div key={label} className="text-center bg-white rounded p-2">
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className={`font-semibold text-sm ${color}`}>{display ?? fmt(value!)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Based on vehicle rates × distance</span>
                      </div>
                    </div>
                  )}

                  {/* Save footer */}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setTripDialog(null); resetTripState(); }}>Cancel</Button>
                    <Button className="flex-1" onClick={saveTrip}
                      disabled={createTrip.isPending || updateTrip.isPending || !tripForm.customerId || !tripForm.vehicleId || !tripForm.driverId || !tripForm.startLocation || !tripForm.endLocation}>
                      {tripDialog === "add" ? "Create Trip" : "Save Changes"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════════
          CREATE TRIP INVOICE DIALOG
      ══════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={invoiceDialog === "create"} onOpenChange={o => { if (!o) setInvoiceDialog(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Trip Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label>Trip (must be Confirmed) *</Label>
              <Select value={invoiceForm.tripId} onValueChange={v => {
                const trip = trips.find(t => t.id === v);
                const updated = { ...invoiceForm, tripId: v,
                  customerId: trip?.customerId ?? invoiceForm.customerId,
                  distanceKm: trip?.distanceKm ?? invoiceForm.distanceKm,
                };
                // Auto-fill rate from vehicle
                const vehicle = vehicles.find(vh => vh.id === trip?.vehicleId);
                if (vehicle?.ratePerKm) updated.ratePerKm = vehicle.ratePerKm;
                if (vehicle?.baseCharge) updated.baseCharge = vehicle.baseCharge;
                setInvoiceForm(recalcInvoice(updated));
              }}>
                <SelectTrigger><SelectValue placeholder="Select confirmed trip" /></SelectTrigger>
                <SelectContent>
                  {trips.filter(t => t.status === "confirmed").map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.tripNumber} — {customerName(t.customerId)} — {fmtDate(t.tripDate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Invoice Date *</Label>
                <Input type="date" value={invoiceForm.invoiceDate}
                  onChange={e => setInvoiceForm(f => ({ ...f, invoiceDate: e.target.value }))} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={invoiceForm.dueDate}
                  onChange={e => setInvoiceForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Distance (km)</Label>
                <Input type="number" step="0.1" placeholder="0" value={invoiceForm.distanceKm}
                  onChange={e => setInvoiceForm(f => recalcInvoice({ ...f, distanceKm: e.target.value }))} />
              </div>
              <div>
                <Label>Rate / km (₹)</Label>
                <Input type="number" step="0.01" placeholder="0" value={invoiceForm.ratePerKm}
                  onChange={e => setInvoiceForm(f => recalcInvoice({ ...f, ratePerKm: e.target.value }))} />
              </div>
              <div>
                <Label>Base Charge (₹)</Label>
                <Input type="number" step="0.01" placeholder="0" value={invoiceForm.baseCharge}
                  onChange={e => setInvoiceForm(f => recalcInvoice({ ...f, baseCharge: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>GST Rate (%)</Label>
              <Input type="number" step="0.01" placeholder="0" value={invoiceForm.gstRate}
                onChange={e => setInvoiceForm(f => recalcInvoice({ ...f, gstRate: e.target.value }))} />
            </div>
            {/* Computed totals preview */}
            {(parseFloat(invoiceForm.subtotal) > 0) && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (ex-GST)</span><span>{fmt(invoiceForm.subtotal)}</span></div>
                {parseFloat(invoiceForm.taxAmount) > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">GST ({invoiceForm.gstRate}%)</span><span>{fmt(invoiceForm.taxAmount)}</span></div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1"><span>Grand Total</span><span>{fmt(invoiceForm.grandTotal)}</span></div>
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={invoiceForm.notes}
                onChange={e => setInvoiceForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setInvoiceDialog(null)}>Cancel</Button>
            <Button onClick={() => createInvoice.mutate({
              tripId: invoiceForm.tripId, customerId: invoiceForm.customerId,
              invoiceDate: invoiceForm.invoiceDate, dueDate: invoiceForm.dueDate || null,
              subtotal: invoiceForm.subtotal, gstRate: invoiceForm.gstRate,
              taxAmount: invoiceForm.taxAmount, grandTotal: invoiceForm.grandTotal,
              distanceKm: invoiceForm.distanceKm || null, ratePerKm: invoiceForm.ratePerKm || null,
              baseCharge: invoiceForm.baseCharge || "0", notes: invoiceForm.notes || null,
            })}
              disabled={createInvoice.isPending || !invoiceForm.tripId || !invoiceForm.grandTotal}>
              {createInvoice.isPending ? "Creating…" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════════
          VIEW TRIP INVOICE DIALOG
      ══════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={invoiceDialog === "view"} onOpenChange={o => { if (!o) { setInvoiceDialog(null); setShowCancelConfirm(false); setCancelReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Trip Invoice</DialogTitle></DialogHeader>
          {selectedInvoice && (
            <div className="space-y-3 mt-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-sm font-semibold">{selectedInvoice.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(selectedInvoice.invoiceDate)}{selectedInvoice.dueDate ? ` · Due ${fmtDate(selectedInvoice.dueDate)}` : ""}</p>
                </div>
                {statusBadge(selectedInvoice.status)}
              </div>
              <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span>{customerName(selectedInvoice.customerId)}</span></div>
                {selectedInvoice.distanceKm && <div className="flex justify-between"><span className="text-muted-foreground">Distance</span><span>{Number(selectedInvoice.distanceKm).toFixed(1)} km</span></div>}
                {selectedInvoice.ratePerKm && <div className="flex justify-between"><span className="text-muted-foreground">Rate/km</span><span>₹{Number(selectedInvoice.ratePerKm).toFixed(2)}</span></div>}
                <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Subtotal (ex-GST)</span><span>{fmt(selectedInvoice.subtotal)}</span></div>
                {Number(selectedInvoice.taxAmount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">GST ({Number(selectedInvoice.gstRate).toFixed(1)}%)</span><span>{fmt(selectedInvoice.taxAmount)}</span></div>}
                <div className="flex justify-between font-semibold border-t pt-1"><span>Grand Total</span><span>{fmt(selectedInvoice.grandTotal)}</span></div>
                <div className={`flex justify-between font-semibold ${(selectedInvoice.outstanding ?? 0) > 0 ? "text-orange-600" : "text-green-600"}`}>
                  <span>Outstanding</span><span>{fmt(selectedInvoice.outstanding ?? 0)}</span>
                </div>
              </div>
              {selectedInvoice.notes && <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">{selectedInvoice.notes}</p>}

              {/* Cancel section */}
              {canEdit && selectedInvoice.status !== "cancelled" && (
                <div className="border-t pt-3">
                  {!showCancelConfirm ? (
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                      onClick={() => setShowCancelConfirm(true)}>
                      Cancel This Invoice
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-destructive">Cancel reason (optional)</Label>
                      <Input placeholder="Reason…" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setShowCancelConfirm(false); setCancelReason(""); }}>Back</Button>
                        <Button variant="destructive" size="sm"
                          disabled={cancelInvoice.isPending}
                          onClick={() => cancelInvoice.mutate({ id: selectedInvoice.id, reason: cancelReason })}>
                          {cancelInvoice.isPending ? "Cancelling…" : "Confirm Cancel"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════════
          RECORD PAYMENT DIALOG
      ══════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={invoiceDialog === "pay"} onOpenChange={o => { if (!o) setInvoiceDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            {selectedInvoice && <p className="text-sm text-muted-foreground">{selectedInvoice.invoiceNumber} · Outstanding: {fmt(selectedInvoice.outstanding ?? 0)}</p>}
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (₹) *</Label>
                <Input type="number" step="0.01" value={payForm.amount}
                  onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <Label>Payment Date *</Label>
                <Input type="date" value={payForm.paymentDate}
                  onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Cash / Bank Account *</Label>
              <Select value={payForm.cashAccountId} onValueChange={v => setPayForm(f => ({ ...f, cashAccountId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {cashAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Method</Label>
              <Select value={payForm.method} onValueChange={v => setPayForm(f => ({ ...f, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["cash","upi","bank_transfer","cheque","card"].map(m => (
                    <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference / UTR</Label>
              <Input placeholder="optional" value={payForm.reference}
                onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Input placeholder="optional" value={payForm.notes}
                onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setInvoiceDialog(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!selectedInvoice) return;
              recordTripPayment.mutate({
                tripInvoiceId: selectedInvoice.id,
                customerId: selectedInvoice.customerId,
                amount: payForm.amount,
                paymentDate: payForm.paymentDate,
                method: payForm.method,
                cashAccountId: payForm.cashAccountId,
                reference: payForm.reference || null,
                notes: payForm.notes || null,
              });
            }}
              disabled={recordTripPayment.isPending || !payForm.amount || !payForm.cashAccountId}>
              {recordTripPayment.isPending ? "Recording…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
