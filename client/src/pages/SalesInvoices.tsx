import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import {
  FileText, Plus, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, CreditCard, Building2, User, Search, RotateCcw, RefreshCw,
  MessageCircle, AlertTriangle, Upload, ExternalLink, ClipboardCheck, Truck
} from "lucide-react";
import type { SalesInvoice, SalesInvoiceItem, CustomerPayment, DeliveryChallan, Customer } from "@shared/schema";
import { resolveMergeField, isCommonMergeField, mergeFieldSourceLabel, type MergeFieldDocumentContext } from "@shared/mergeFields";

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function statusBadge(status: string) {
  if (status === "paid") return <Badge className="bg-green-100 text-green-800 border-green-200">Paid</Badge>;
  if (status === "partial_paid") return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Partial Paid</Badge>;
  return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Pending</Badge>;
}

function uploadStatusBadge(uploadStatus: string | null | undefined) {
  if (uploadStatus === "recorded") return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs"><ClipboardCheck className="w-2.5 h-2.5 mr-0.5" />Recorded</Badge>;
  if (uploadStatus === "cancelled") return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Cancelled</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs"><Upload className="w-2.5 h-2.5 mr-0.5" />Upload Pending</Badge>;
}

type InvoiceWithExtras = SalesInvoice & {
  items: SalesInvoiceItem[];
  payments: CustomerPayment[];
  totalPaid: number;
  balance: number;
};

type SalesReturnItem = {
  id: string;
  productId: string | null;
  description: string;
  qtySold: string;
  qtyAlreadyReturned: string;
  qtyReturned: string;
  unitPrice: string;
  hsnCode: string | null;
  gstRate: string;
  taxableAmount: string;
  cgst: string;
  sgst: string;
  igst: string;
  taxAmount: string;
  totalAmount: string;
};

type SalesReturn = {
  id: string;
  returnNumber: string;
  invoiceId: string;
  status: string;
  returnType: string;
  reason: string | null;
  returnDate: string;
  items: SalesReturnItem[];
  creditNote?: { creditNoteNumber: string; grandTotal: string } | null;
};

// ─── Create from Challan Dialog ──────────────────────────────────────────────
function CreateInvoiceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [challanId, setChallanId] = useState("");
  const [isInterState, setIsInterState] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: challans = [] } = useQuery<DeliveryChallan[]>({ queryKey: ["/api/delivery-challans"] });

  const dispatchedChallans = challans.filter((c) => c.status === "dispatched");

  const createMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/sales-invoices/create-from-challan/${id}`, {
        isInterState,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
      }),
    onSuccess: async (inv: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      toast({ title: "Invoice Created", description: `${inv.invoiceNumber} created successfully` });
      onClose();
      resetForm();
    },
    onError: async (err: any) => {
      let msg = "Failed to create invoice";
      try {
        const body = await err.response?.json?.();
        msg = body?.message ?? msg;
      } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  function resetForm() {
    setChallanId("");
    setIsInterState(false);
    setDueDate("");
    setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); resetForm(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create GST Invoice from Delivery Challan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Dispatched Challan *</Label>
            <Select value={challanId} onValueChange={setChallanId}>
              <SelectTrigger data-testid="select-challan">
                <SelectValue placeholder="Select a dispatched challan…" />
              </SelectTrigger>
              <SelectContent>
                {dispatchedChallans.length === 0 ? (
                  <SelectItem value="_none" disabled>No dispatched challans available</SelectItem>
                ) : (
                  dispatchedChallans.map((c) => (
                    <SelectItem key={c.id} value={c.id} data-testid={`option-challan-${c.id}`}>
                      {c.challanNumber}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>GST Type</Label>
            <Select
              value={isInterState ? "inter" : "intra"}
              onValueChange={(v) => setIsInterState(v === "inter")}
            >
              <SelectTrigger data-testid="select-gst-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="intra">Intra-State (CGST + SGST)</SelectItem>
                <SelectItem value="inter">Inter-State (IGST)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Due Date (optional)</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="input-due-date"
            />
          </div>

          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any billing notes…"
              data-testid="input-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); resetForm(); }} data-testid="button-cancel-invoice">Cancel</Button>
          <Button
            disabled={!challanId || createMut.isPending}
            onClick={() => challanId && createMut.mutate(challanId)}
            data-testid="button-create-invoice"
          >
            {createMut.isPending ? "Creating…" : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record Payment Dialog ───────────────────────────────────────────────────
function RecordPaymentDialog({
  invoice,
  open,
  onClose,
}: {
  invoice: InvoiceWithExtras;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const payMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/customer-payments", {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        amount: parseFloat(amount),
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        method,
        reference: reference || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices", invoice.id] });
      toast({ title: "Payment Recorded", description: `₹${parseFloat(amount).toLocaleString("en-IN")} recorded for ${invoice.invoiceNumber}` });
      onClose();
    },
    onError: async (err: any) => {
      let msg = "Failed to record payment";
      try { const b = await err.response?.json?.(); msg = b?.message ?? msg; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const maxAmount = invoice.balance;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment — {invoice.invoiceNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-muted rounded-lg p-3 text-sm flex justify-between">
            <span className="text-muted-foreground">Outstanding Balance</span>
            <span className="font-semibold text-orange-600">{fmt(maxAmount)}</span>
          </div>
          <div className="space-y-1">
            <Label>Amount (₹) *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={maxAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              data-testid="input-payment-amount"
            />
          </div>
          <div className="space-y-1">
            <Label>Payment Date *</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              data-testid="input-payment-date"
            />
          </div>
          <div className="space-y-1">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger data-testid="select-payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="neft">NEFT</SelectItem>
                <SelectItem value="rtgs">RTGS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reference / UTR</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction reference"
              data-testid="input-payment-reference"
            />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              data-testid="input-payment-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-payment">Cancel</Button>
          <Button
            disabled={!amount || parseFloat(amount) <= 0 || payMut.isPending}
            onClick={() => payMut.mutate()}
            data-testid="button-record-payment"
          >
            {payMut.isPending ? "Recording…" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sales Return Dialog ──────────────────────────────────────────────────────
function SalesReturnDialog({
  invoice,
  open,
  onClose,
}: {
  invoice: InvoiceWithExtras;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [salesReturn, setSalesReturn] = useState<SalesReturn | null>(null);
  const [returnType, setReturnType] = useState("customer_rejection");
  const [reason, setReason] = useState("");
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [processed, setProcessed] = useState(false);

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/sales-returns/create-from-invoice/${invoice.id}`, {}),
    onSuccess: (sr: any) => {
      setSalesReturn(sr);
      const initQtys: Record<string, string> = {};
      (sr.items ?? []).forEach((item: SalesReturnItem) => {
        initQtys[item.id] = "0";
      });
      setQtys(initQtys);
    },
    onError: async (err: any) => {
      let msg = "Failed to create return";
      try { const b = await err.response?.json?.(); msg = b?.message ?? msg; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const processMut = useMutation({
    mutationFn: async () => {
      if (!salesReturn) throw new Error("No return to process");
      await apiRequest("PATCH", `/api/sales-returns/${salesReturn.id}`, {
        reason: reason || undefined,
        returnType,
        items: salesReturn.items.map((item) => ({
          id: item.id,
          qtyReturned: parseFloat(qtys[item.id] ?? "0"),
        })),
      });
      return apiRequest("POST", `/api/sales-returns/${salesReturn.id}/process`, {});
    },
    onSuccess: (result: any) => {
      setProcessed(true);
      setSalesReturn((prev) => prev ? { ...prev, status: "processed", creditNote: result?.creditNote } : prev);
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices", invoice.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/credit-notes"] });
      toast({
        title: "Return Processed",
        description: `Credit Note ${result?.creditNote?.creditNoteNumber ?? ""} issued`,
      });
    },
    onError: async (err: any) => {
      let msg = "Failed to process return";
      try { const b = await err.response?.json?.(); msg = b?.message ?? msg; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  function computePreview() {
    if (!salesReturn) return { subtotal: 0, tax: 0, total: 0 };
    const isInterState = invoice.isInterState;
    let subtotal = 0, tax = 0;
    for (const item of salesReturn.items) {
      const qty = parseFloat(qtys[item.id] ?? "0");
      if (qty <= 0) continue;
      const taxable = qty * Number(item.unitPrice);
      const itemTax = taxable * Number(item.gstRate) / 100;
      subtotal += taxable;
      tax += itemTax;
    }
    return { subtotal, tax, total: subtotal + tax, isInterState };
  }

  const preview = computePreview();

  function handleClose() {
    setSalesReturn(null);
    setReturnType("customer_rejection");
    setReason("");
    setQtys({});
    setProcessed(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Sales Return — {invoice.invoiceNumber}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="space-y-4 p-1 pr-3">
            {!salesReturn && !createMut.isPending && (
              <div className="rounded-lg bg-muted/40 p-4 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Create a return draft to begin selecting items and quantities.
                </p>
                <Button
                  onClick={() => createMut.mutate()}
                  data-testid="button-init-return"
                >
                  <RotateCcw className="w-4 h-4 mr-2" /> Initiate Return
                </Button>
              </div>
            )}

            {createMut.isPending && (
              <div className="p-4 text-center text-sm text-muted-foreground">Creating return draft…</div>
            )}

            {salesReturn && (
              <>
                {/* Return details */}
                {!processed && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Return Type *</Label>
                      <Select value={returnType} onValueChange={setReturnType}>
                        <SelectTrigger data-testid="select-return-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="customer_rejection">Customer Rejection</SelectItem>
                          <SelectItem value="damage">Damage</SelectItem>
                          <SelectItem value="excess">Excess / Over-delivery</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Reason (optional)</Label>
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Brief description…"
                        data-testid="input-return-reason"
                      />
                    </div>
                  </div>
                )}

                {/* Processed credit note info */}
                {processed && salesReturn.creditNote && (
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-green-800">Return Processed</p>
                      <p className="text-xs text-green-700">Credit Note: {salesReturn.creditNote.creditNoteNumber}</p>
                    </div>
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      {fmt(salesReturn.creditNote.grandTotal)}
                    </Badge>
                  </div>
                )}

                {/* Items table */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Returnable Items</h3>
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs">Product</TableHead>
                          <TableHead className="text-xs text-right">Sold</TableHead>
                          <TableHead className="text-xs text-right">Already Returned</TableHead>
                          <TableHead className="text-xs text-right">Returnable</TableHead>
                          <TableHead className="text-xs text-right">Return Qty</TableHead>
                          <TableHead className="text-xs text-right">Unit Price</TableHead>
                          <TableHead className="text-xs text-right">GST%</TableHead>
                          <TableHead className="text-xs text-right">Credit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {salesReturn.items.map((item, idx) => {
                          const maxQty = Number(item.qtySold) - Number(item.qtyAlreadyReturned);
                          const qty = parseFloat(qtys[item.id] ?? "0");
                          const credit = qty > 0
                            ? (qty * Number(item.unitPrice)) * (1 + Number(item.gstRate) / 100)
                            : 0;
                          return (
                            <TableRow key={item.id} data-testid={`row-return-item-${idx}`}>
                              <TableCell className="text-sm font-medium">{item.description}</TableCell>
                              <TableCell className="text-sm text-right">{Number(item.qtySold)}</TableCell>
                              <TableCell className="text-sm text-right text-orange-600">{Number(item.qtyAlreadyReturned)}</TableCell>
                              <TableCell className="text-sm text-right font-medium">{maxQty}</TableCell>
                              <TableCell className="text-right">
                                {processed ? (
                                  <span className="text-sm font-medium">{Number(item.qtyReturned)}</span>
                                ) : (
                                  <Input
                                    type="number"
                                    min={0}
                                    max={maxQty}
                                    step={1}
                                    value={qtys[item.id] ?? "0"}
                                    onChange={(e) => setQtys((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                    className="w-20 h-7 text-sm text-right"
                                    disabled={maxQty <= 0}
                                    data-testid={`input-return-qty-${idx}`}
                                  />
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-right">{fmt(item.unitPrice)}</TableCell>
                              <TableCell className="text-sm text-right">{Number(item.gstRate)}%</TableCell>
                              <TableCell className="text-sm text-right font-medium text-blue-700">
                                {credit > 0 ? fmt(credit) : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Summary footer */}
                {!processed && (
                  <Card className="bg-muted/30">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal (Taxable)</span>
                        <span>{fmt(preview.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">GST Reversal</span>
                        <span className="text-blue-700">−{fmt(preview.tax)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-base">
                        <span>Total Credit Note Value</span>
                        <span className="text-primary">{fmt(preview.total)}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Attachments (after processing) */}
                {processed && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Attachments (Return Proof / Documents)</h3>
                    <AttachmentsPanel
                      entityType="sales_return"
                      entityId={salesReturn.id}
                      module="sales"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-return">
            {processed ? "Close" : "Cancel"}
          </Button>
          {salesReturn && !processed && (
            <Button
              onClick={() => processMut.mutate()}
              disabled={processMut.isPending || !Object.values(qtys).some((q) => parseFloat(q) > 0)}
              data-testid="button-process-return"
            >
              {processMut.isPending ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Processing…</>
              ) : (
                <><RotateCcw className="w-4 h-4 mr-2" /> Process Return</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invoice Detail Panel ────────────────────────────────────────────────────
async function uploadInvoiceFile(invoiceId: string, route: string, file: File, extra?: Record<string, string>) {
  const token = localStorage.getItem("token");
  const fd = new FormData();
  fd.append("file", file);
  if (extra) Object.entries(extra).forEach(([k, v]) => v && fd.append(k, v));
  const res = await fetch(`/api/sales-invoices/${invoiceId}/${route}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Upload failed"); }
  return res.json();
}

function InvoiceDetailPanel({
  invoiceId,
  customers,
}: {
  invoiceId: string;
  customers: Customer[];
}) {
  const { toast } = useToast();
  const [payOpen, setPayOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [signedCopyFile, setSignedCopyFile] = useState<File | null>(null);
  const [ewayBillFile, setEwayBillFile] = useState<File | null>(null);
  const [ewayBillNumber, setEwayBillNumber] = useState("");
  const [ewayBillDate, setEwayBillDate] = useState("");
  const [extInvoiceNumber, setExtInvoiceNumber] = useState("");
  const [extInvoiceDate, setExtInvoiceDate] = useState("");
  const [extTotalAmount, setExtTotalAmount] = useState("");
  const [extGstAmount, setExtGstAmount] = useState("");
  const [markDueDate, setMarkDueDate] = useState("");
  const [showVarianceModal, setShowVarianceModal] = useState(false);
  const [docsExpanded, setDocsExpanded] = useState(false);

  const { data: inv, isLoading } = useQuery<InvoiceWithExtras>({
    queryKey: ["/api/sales-invoices", invoiceId],
    queryFn: () => fetch(`/api/sales-invoices/${invoiceId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    }).then((r) => r.json()),
    enabled: !!invoiceId,
  });

  // Fetch credit notes for this invoice
  const { data: creditNotes = [] } = useQuery<any[]>({
    queryKey: ["/api/credit-notes"],
    select: (cns) => cns.filter((cn: any) => cn.invoiceId === invoiceId),
  });

  const invalidateInv = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices", invoiceId] });
    queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
  };

  // Pre-populate markDueDate from the invoice's computed dueDate once loaded
  useEffect(() => {
    if (inv?.dueDate && !markDueDate) {
      const d = new Date(inv.dueDate);
      if (!isNaN(d.getTime())) {
        setMarkDueDate(d.toISOString().slice(0, 10));
      }
    }
  }, [inv?.dueDate]);

  const markRecordedMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/sales-invoices/${invoiceId}/mark-recorded`, {
      extInvoiceNumber,
      extInvoiceDate,
      extTotalAmount,
      extGstAmount: extGstAmount || undefined,
      dueDate: markDueDate || undefined,
    }),
    onSuccess: () => {
      invalidateInv();
      setShowVarianceModal(false);
      toast({ title: "Invoice Recorded", description: "Upload status updated to Recorded." });
    },
    onError: async (e: any) => {
      setShowVarianceModal(false);
      let msg = "Failed";
      try { const b = await e.response?.json?.(); msg = b?.message ?? msg; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const uploadSignedCopyMutation = useMutation({
    mutationFn: (file: File) => uploadInvoiceFile(invoiceId, "upload-signed-copy", file),
    onSuccess: () => { invalidateInv(); setSignedCopyFile(null); toast({ title: "Uploaded", description: "Signed invoice copy saved." }); },
    onError: (e: any) => toast({ title: "Upload Failed", description: e.message, variant: "destructive" }),
  });

  const uploadEwayBillMutation = useMutation({
    mutationFn: (file: File | null) => {
      if (file) return uploadInvoiceFile(invoiceId, "upload-eway-bill", file, { ewayBillNumber, ewayBillDate });
      return apiRequest("PATCH", `/api/sales-invoices/${invoiceId}`, { ewayBillNumber: ewayBillNumber || undefined, ewayBillDate: ewayBillDate || undefined }).then(r => r.json());
    },
    onSuccess: () => { invalidateInv(); setEwayBillFile(null); setEwayBillNumber(""); setEwayBillDate(""); toast({ title: "E-way Bill Saved", description: "E-way bill details updated." }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !inv) return <div className="p-6 text-muted-foreground text-sm">Loading invoice…</div>;

  const customer = customers.find((c) => c.id === inv.customerId);
  const subtotal = Number(inv.subtotal);
  const totalCgst = Number(inv.totalCgst);
  const totalSgst = Number(inv.totalSgst);
  const totalIgst = Number(inv.totalIgst);
  const totalTax = Number(inv.totalTax);
  const grandTotal = Number(inv.grandTotal);
  const creditedAmount = Number(inv.creditedAmount ?? 0);
  const isInterState = inv.isInterState;
  const isB2B = inv.customerType === "B2B";
  const netBalance = Math.max(0, grandTotal - (inv.totalPaid ?? 0) - creditedAmount);

  function handleMarkRecordedClick() {
    if (!extInvoiceNumber.trim() || !extInvoiceDate || !extTotalAmount) return;
    const diff = Math.abs(Number(extTotalAmount) - grandTotal);
    if (diff > 5) {
      setShowVarianceModal(true);
    } else {
      markRecordedMutation.mutate();
    }
  }

  return (
    <div className="p-5 space-y-5">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground font-mono tracking-tight">{inv.invoiceNumber}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            {inv.dueDate && ` · Due ${new Date(inv.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {statusBadge(inv.status)}
            {uploadStatusBadge((inv as any).uploadStatus)}
          </div>
          <div className="flex items-center gap-1.5">
            {isB2B ? (
              <Badge variant="outline" className="text-xs gap-1"><Building2 className="w-3 h-3" />B2B</Badge>
            ) : (
              <Badge variant="outline" className="text-xs gap-1"><User className="w-3 h-3" />B2C</Badge>
            )}
            {customer?.phone && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                onClick={() => setWaOpen(true)}
                data-testid={`button-wa-invoice-${inv.id}`}
                title="Send WhatsApp template"
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1" /> WA
              </Button>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* ── Customer ─────────────────────────────────────────────────────── */}
      <div className="rounded-lg bg-muted/30 border px-4 py-3 space-y-1.5">
        <p className="text-lg font-semibold text-foreground">{customer?.name ?? "—"}</p>
        {customer?.phone && (
          <p className="text-sm text-muted-foreground">
            +91 {customer.phone.replace(/^\+?91/, "").replace(/\D/g, "").slice(-10)}
          </p>
        )}
        {isB2B && inv.customerGSTIN && (
          <p className="text-sm font-mono text-blue-600">GSTIN: {inv.customerGSTIN}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {isInterState ? "⟶ Inter-State Supply (IGST)" : "⟶ Intra-State Supply (CGST + SGST)"}
        </p>
      </div>

      {/* ── Line Items ───────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-2 text-foreground">Line Items</h3>
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">HSN</TableHead>
                <TableHead className="text-xs text-right">Qty</TableHead>
                <TableHead className="text-xs text-right">Rate</TableHead>
                <TableHead className="text-xs text-right">Taxable</TableHead>
                <TableHead className="text-xs text-right">GST%</TableHead>
                {isInterState ? (
                  <TableHead className="text-xs text-right">IGST</TableHead>
                ) : (
                  <>
                    <TableHead className="text-xs text-right">CGST</TableHead>
                    <TableHead className="text-xs text-right">SGST</TableHead>
                  </>
                )}
                <TableHead className="text-xs text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(inv.items ?? []).map((item, idx) => (
                <TableRow key={item.id ?? idx} data-testid={`row-invoice-item-${idx}`}>
                  <TableCell className="text-xs max-w-[140px] whitespace-normal">{item.description}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{item.hsnCode ?? "—"}</TableCell>
                  <TableCell className="text-xs text-right">{Number(item.qty)}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(item.unitPrice)}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(item.taxableAmount)}</TableCell>
                  <TableCell className="text-xs text-right">{Number(item.gstRate)}%</TableCell>
                  {isInterState ? (
                    <TableCell className="text-xs text-right">{fmt(item.igst)}</TableCell>
                  ) : (
                    <>
                      <TableCell className="text-xs text-right">{fmt(item.cgst)}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(item.sgst)}</TableCell>
                    </>
                  )}
                  <TableCell className="text-xs text-right font-medium">{fmt(item.totalAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Totals Block ─────────────────────────────────────────────────── */}
      <div className="rounded-lg bg-muted/20 border px-4 py-3 space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span className="text-foreground">{fmt(subtotal)}</span>
        </div>
        {isInterState ? (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>IGST</span>
            <span className="text-foreground">{fmt(totalIgst)}</span>
          </div>
        ) : (
          <>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>CGST</span>
              <span className="text-foreground">{fmt(totalCgst)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>SGST</span>
              <span className="text-foreground">{fmt(totalSgst)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Total Tax</span>
          <span className="text-foreground">{fmt(totalTax)}</span>
        </div>
        <Separator className="my-1" />
        <div className="flex justify-between items-baseline">
          <span className="text-base font-semibold">Grand Total</span>
          <span className="text-2xl font-bold text-primary">{fmt(grandTotal)}</span>
        </div>
      </div>

      {/* Credit Notes section */}
      {creditNotes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Credit Notes</h3>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Credit Note #</TableHead>
                  <TableHead className="text-xs text-right">Subtotal</TableHead>
                  <TableHead className="text-xs text-right">GST</TableHead>
                  <TableHead className="text-xs text-right">Total Credit</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditNotes.map((cn: any, idx: number) => (
                  <TableRow key={cn.id} data-testid={`row-credit-note-${idx}`}>
                    <TableCell className="text-sm font-mono font-medium text-blue-700">{cn.creditNoteNumber}</TableCell>
                    <TableCell className="text-sm text-right">{fmt(cn.subtotal)}</TableCell>
                    <TableCell className="text-sm text-right">{fmt(cn.taxAmount)}</TableCell>
                    <TableCell className="text-sm text-right font-semibold text-green-700">{fmt(cn.grandTotal)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{cn.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {creditedAmount > 0 && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm">
              <span className="text-muted-foreground">Total Credits Applied</span>
              <span className="font-semibold text-blue-700">{fmt(creditedAmount)}</span>
            </div>
          )}
        </div>
      )}

      {/* Payment Tracking */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Payment History</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setReturnOpen(true)} data-testid="button-create-return">
              <RotateCcw className="w-3 h-3 mr-1" /> Create Return
            </Button>
            {inv.status !== "paid" && (
              <Button size="sm" variant="outline" onClick={() => setPayOpen(true)} data-testid="button-add-payment">
                <CreditCard className="w-4 h-4 mr-1" /> Record Payment
              </Button>
            )}
          </div>
        </div>

        {(inv.payments ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No payments recorded yet.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(inv.payments ?? []).map((p, idx) => (
                  <TableRow key={p.id ?? idx} data-testid={`row-payment-${idx}`}>
                    <TableCell className="text-sm">{new Date(p.paymentDate).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell className="text-sm capitalize">{p.method.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-sm font-mono">{p.reference ?? "—"}</TableCell>
                    <TableCell className="text-sm text-right font-medium text-green-700">{fmt(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Balance summary */}
        <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/40 p-3 text-sm">
          <span className="text-muted-foreground">Total Paid</span>
          <span className="font-medium text-green-700">{fmt(inv.totalPaid)}</span>
        </div>
        {creditedAmount > 0 && (
          <div className="mt-1 flex items-center justify-between rounded-lg bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Credits Applied</span>
            <span className="font-medium text-blue-700">{fmt(creditedAmount)}</span>
          </div>
        )}
        <div className="mt-1 flex items-center justify-between rounded-lg bg-muted/40 p-3 text-sm">
          <span className="text-muted-foreground">Balance Due</span>
          <span className={`font-semibold ${netBalance > 0 ? "text-orange-600" : "text-green-600"}`}>{fmt(netBalance)}</span>
        </div>
      </div>

      {/* ── Document Status ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Document Status</h3>

        {/* Signed Invoice Copy row */}
        <div className="rounded-lg border bg-muted/10 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">Signed Invoice Copy</span>
            </div>
            {(inv as any).signedCopyUrl ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />Uploaded
                  {(inv as any).signedCopyUploadedAt && ` · ${new Date((inv as any).signedCopyUploadedAt).toLocaleDateString("en-IN")}`}
                </span>
                <a href={(inv as any).signedCopyUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1" data-testid="link-signed-copy">
                  <ExternalLink className="w-3 h-3" />View
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />Not uploaded yet
                </span>
                <div className="flex items-center gap-1.5">
                  <Input type="file" accept=".pdf,.jpg,.jpeg,.png" className="h-7 text-xs w-28" data-testid="input-invoice-signed-copy" onChange={(e) => setSignedCopyFile(e.target.files?.[0] ?? null)} />
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!signedCopyFile || uploadSignedCopyMutation.isPending} data-testid="button-upload-invoice-signed-copy" onClick={() => signedCopyFile && uploadSignedCopyMutation.mutate(signedCopyFile)}>
                    <Upload className="w-3 h-3 mr-1" />{uploadSignedCopyMutation.isPending ? "…" : "Upload"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* E-way Bill row */}
        <div className="rounded-lg border bg-muted/10 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">E-way Bill</span>
            </div>
            {(inv as any).ewayBillNumber ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="font-mono font-medium">{(inv as any).ewayBillNumber}</span>
                  {(inv as any).ewayBillDate && ` · ${new Date((inv as any).ewayBillDate).toLocaleDateString("en-IN")}`}
                </span>
                {(inv as any).ewayBillUrl && (
                  <a href={(inv as any).ewayBillUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1" data-testid="link-eway-bill">
                    <ExternalLink className="w-3 h-3" />View
                  </a>
                )}
              </div>
            ) : grandTotal < 50000 ? (
              <span className="text-xs text-muted-foreground">Not required</span>
            ) : (
              <span className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />Not entered</span>
            )}
          </div>

          {/* E-way bill entry form when ≥ ₹50k and not yet entered */}
          {!(inv as any).ewayBillNumber && grandTotal >= 50000 && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">E-way Bill No.</Label>
                  <Input className="h-7 text-xs" data-testid="input-eway-bill-number" value={ewayBillNumber} onChange={(e) => setEwayBillNumber(e.target.value)} placeholder="e.g. 331234567890" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valid Until</Label>
                  <Input type="date" className="h-7 text-xs" data-testid="input-eway-bill-date" value={ewayBillDate} onChange={(e) => setEwayBillDate(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input type="file" accept=".pdf,.jpg,.jpeg,.png" className="h-7 text-xs flex-1" data-testid="input-eway-bill-file" onChange={(e) => setEwayBillFile(e.target.files?.[0] ?? null)} />
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={(!ewayBillNumber && !ewayBillFile) || uploadEwayBillMutation.isPending} data-testid="button-save-eway-bill" onClick={() => uploadEwayBillMutation.mutate(ewayBillFile)}>
                  <Upload className="w-3 h-3 mr-1" />{uploadEwayBillMutation.isPending ? "…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Mark as Recorded (collapsible) ───────────────────────────────── */}
      {(inv as any).uploadStatus !== "recorded" && (
        <div>
          <button
            className="w-full flex items-center justify-between text-sm font-semibold hover:text-primary transition-colors py-1"
            onClick={() => setDocsExpanded(!docsExpanded)}
            data-testid="toggle-docs-section"
          >
            <span className="flex items-center gap-1.5"><ClipboardCheck className="w-4 h-4" />Mark as Recorded</span>
            {docsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {docsExpanded && (
            <div className="mt-2">
              {!(inv as any).signedCopyUrl ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800">Upload the signed invoice copy (above) before marking as recorded.</p>
                </div>
              ) : (
                <div className="border rounded-md p-3 space-y-3 bg-amber-50 border-amber-200">
                  <p className="text-xs font-medium text-amber-800">Enter external book details to mark as recorded</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Ext. Invoice No. *</Label>
                      <Input className="h-8 text-xs" data-testid="input-ext-invoice-number" value={extInvoiceNumber} onChange={(e) => setExtInvoiceNumber(e.target.value)} placeholder="e.g. INV/2024/001" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ext. Invoice Date *</Label>
                      <Input type="date" className="h-8 text-xs" data-testid="input-ext-invoice-date" value={extInvoiceDate} onChange={(e) => setExtInvoiceDate(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ext. Total Amount ₹ *</Label>
                      <Input type="number" className="h-8 text-xs" data-testid="input-ext-total-amount" value={extTotalAmount} onChange={(e) => setExtTotalAmount(e.target.value)} placeholder={fmt(grandTotal)} step="0.01" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ext. GST Amount ₹ (opt.)</Label>
                      <Input type="number" className="h-8 text-xs" data-testid="input-ext-gst-amount" value={extGstAmount} onChange={(e) => setExtGstAmount(e.target.value)} placeholder={fmt(totalTax)} step="0.01" />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Override Due Date (opt.)</Label>
                      <Input type="date" className="h-8 text-xs" data-testid="input-mark-due-date" value={markDueDate} onChange={(e) => setMarkDueDate(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Leave as-is to keep the auto-computed due date.</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    data-testid="button-mark-recorded"
                    disabled={markRecordedMutation.isPending || !extInvoiceNumber.trim() || !extInvoiceDate || !extTotalAmount}
                    onClick={handleMarkRecordedClick}
                  >
                    <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" />{markRecordedMutation.isPending ? "Saving…" : "Mark as Recorded"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── External Reference (if recorded) ─────────────────────────────── */}
      {(inv as any).uploadStatus === "recorded" && (inv as any).extInvoiceNumber && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-emerald-800">External Book Reference</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-emerald-700">
            <div><span className="text-muted-foreground">Ext. Invoice:</span> <span className="font-mono font-medium">{(inv as any).extInvoiceNumber}</span></div>
            {(inv as any).extInvoiceDate && <div><span className="text-muted-foreground">Date:</span> {new Date((inv as any).extInvoiceDate).toLocaleDateString("en-IN")}</div>}
            {(inv as any).extTotalAmount && <div><span className="text-muted-foreground">Ext. Total:</span> {fmt((inv as any).extTotalAmount)}</div>}
            {(inv as any).extGstAmount && <div><span className="text-muted-foreground">Ext. GST:</span> {fmt((inv as any).extGstAmount)}</div>}
          </div>
        </div>
      )}

      {/* ── Attachments ───────────────────────────────────────────────────── */}
      <AttachmentsPanel entityType="sales_invoices" entityId={invoiceId} />

      {/* ── Action Buttons ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-1">
        {(inv as any).signedCopyUrl ? (
          <a href={(inv as any).signedCopyUrl} target="_blank" rel="noreferrer" download className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5" data-testid="button-download-signed-copy">
              <FileText className="w-3.5 h-3.5" />Download Invoice Copy
            </Button>
          </a>
        ) : (
          <Button variant="outline" size="sm" className="flex-1 gap-1.5 opacity-50 cursor-not-allowed" disabled title="Not uploaded yet" data-testid="button-download-signed-copy-disabled">
            <FileText className="w-3.5 h-3.5" />Download Invoice Copy
          </Button>
        )}
        {(inv as any).ewayBillUrl ? (
          <a href={(inv as any).ewayBillUrl} target="_blank" rel="noreferrer" download className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5" data-testid="button-download-eway-bill">
              <Truck className="w-3.5 h-3.5" />Download E-way Bill
            </Button>
          </a>
        ) : (
          <Button variant="outline" size="sm" className="flex-1 gap-1.5 opacity-50 cursor-not-allowed" disabled title="Not uploaded yet" data-testid="button-download-eway-bill-disabled">
            <Truck className="w-3.5 h-3.5" />Download E-way Bill
          </Button>
        )}
      </div>

      {payOpen && (
        <RecordPaymentDialog invoice={inv} open={payOpen} onClose={() => { setPayOpen(false); }} />
      )}
      {returnOpen && (
        <SalesReturnDialog invoice={inv} open={returnOpen} onClose={() => { setReturnOpen(false); }} />
      )}
      {waOpen && customer && (
        <SendInvoiceWhatsappDialog
          open={waOpen}
          onClose={() => setWaOpen(false)}
          invoice={inv}
          customer={customer}
          balanceDue={netBalance}
        />
      )}

      {/* Variance confirmation modal */}
      <Dialog open={showVarianceModal} onOpenChange={setShowVarianceModal}>
        <DialogContent className="max-w-sm" data-testid="variance-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Amount Mismatch
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">The external total differs from the system-calculated total. This may indicate a typo or a rounding adjustment. Continue with this amount?</p>
            <div className="rounded-md border bg-muted/40 divide-y text-sm">
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">External invoice total</span>
                <span className="font-medium">{fmt(extTotalAmount)}</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">System invoice total</span>
                <span className="font-medium">{fmt(grandTotal)}</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Difference</span>
                <span className="font-semibold text-amber-600">{fmt(Math.abs(Number(extTotalAmount) - grandTotal))}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVarianceModal(false)} data-testid="button-variance-cancel">Cancel</Button>
            <Button onClick={() => markRecordedMutation.mutate()} disabled={markRecordedMutation.isPending} data-testid="button-variance-continue">
              {markRecordedMutation.isPending ? "Saving…" : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Send WhatsApp template (with auto-fill from invoice context) ───────────
function SendInvoiceWhatsappDialog({
  open, onClose, invoice, customer, balanceDue,
}: {
  open: boolean;
  onClose: () => void;
  invoice: InvoiceWithExtras;
  customer: Customer;
  balanceDue: number;
}) {
  const { toast } = useToast();
  const [phone, setPhone] = useState(customer.phone || "");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [vars, setVars] = useState<string[]>([]);
  // Per-variable provenance: "auto:<source>" when filled from invoice/customer
  // context, "manual" when the operator typed/edited it, undefined when empty.
  const [varSources, setVarSources] = useState<(string | undefined)[]>([]);

  const docContext: MergeFieldDocumentContext = {
    type: "invoice",
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.grandTotal,
    balanceDue: balanceDue,
    dueDate: invoice.dueDate ?? null,
    status: invoice.status,
  };
  const customerContext = {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    gstNumber: customer.gstNumber,
    contactPerson: customer.contactPerson,
  };

  const { data: templates = [] } = useQuery<{ id: string; name: string; interaktTemplateName: string; body: string; variables: string[] }[]>({
    queryKey: ["/api/whatsapp/templates"],
    enabled: open,
    select: (d: any[]) => d.filter((t) => t.isActive === "approved"),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      let p = phone.replace(/\D/g, "");
      if (p.length === 10 && /^[6-9]/.test(p)) p = "91" + p;
      const convRes = await apiRequest("POST", "/api/whatsapp/conversations/get-or-create", { phone: p });
      if (!convRes.ok) { const e = await convRes.json(); throw new Error(e.message || "Failed to open conversation"); }
      const conv = await convRes.json();
      const tpl = templates.find((t) => t.interaktTemplateName === selectedTemplate);
      const sendRes = await apiRequest("POST", `/api/whatsapp/conversations/${conv.id}/send`, {
        type: "template",
        templateName: selectedTemplate,
        templateVariables: vars,
        templateVariableNames: tpl?.variables || [],
        documentContext: docContext,
      });
      if (!sendRes.ok) { const e = await sendRes.json(); throw new Error(e.message || "Failed to send"); }
    },
    onSuccess: () => {
      toast({ title: "WhatsApp message sent", description: invoice.invoiceNumber });
      onClose();
    },
    onError: (e: Error) => toast({ title: "WhatsApp send failed", description: e.message, variant: "destructive" }),
  });

  const tpl = templates.find((t) => t.interaktTemplateName === selectedTemplate);
  const matches = tpl?.body?.match(/\{\{(\d+)\}\}/g) || [];
  const previewBody = matches.reduce(
    (b: string, ph: string, i: number) => b.replace(ph, vars[i] || ph),
    tpl?.body || "",
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" /> Send Invoice via WhatsApp
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Phone Number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" data-testid="input-wa-invoice-phone" />
          </div>
          <div className="space-y-1.5">
            <Label>Template</Label>
            {templates.length === 0 ? (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-3 py-2 rounded-md text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>No approved templates available.</span>
              </div>
            ) : (
              <Select
                value={selectedTemplate}
                onValueChange={(v) => {
                  setSelectedTemplate(v);
                  const t = templates.find((x) => x.interaktTemplateName === v);
                  if (!t) { setVars([]); setVarSources([]); return; }
                  const ms = t.body?.match(/\{\{(\d+)\}\}/g) || [];
                  const tplVars = t.variables || [];
                  const next: string[] = [];
                  const nextSources: (string | undefined)[] = [];
                  ms.forEach((_: string, i: number) => {
                    const key = tplVars[i];
                    if (key && isCommonMergeField(key)) {
                      const r = resolveMergeField(key, { customer: customerContext, document: docContext });
                      if (r) {
                        next.push(r);
                        nextSources.push(`auto:${mergeFieldSourceLabel(key, docContext.type ?? null) || "context"}`);
                        return;
                      }
                    }
                    next.push("");
                    nextSources.push(undefined);
                  });
                  setVars(next);
                  setVarSources(nextSources);
                }}
              >
                <SelectTrigger data-testid="select-wa-invoice-template">
                  <SelectValue placeholder="Select an approved template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.interaktTemplateName}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {tpl && matches.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Template Variables</Label>
              {matches.map((_: string, i: number) => {
                const key = (tpl.variables || [])[i];
                const src = varSources[i];
                const auto = src && src.startsWith("auto:") ? src.slice(5) : null;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">
                      {`{{${i + 1}}}`}{key ? ` · ${key}` : ""}
                    </span>
                    <Input
                      className="h-7 text-xs"
                      value={vars[i] || ""}
                      onChange={(e) => {
                        const v = [...vars];
                        v[i] = e.target.value;
                        setVars(v);
                        const s = [...varSources];
                        s[i] = "manual";
                        setVarSources(s);
                      }}
                      placeholder={`Variable ${i + 1}`}
                      data-testid={`input-wa-invoice-var-${i + 1}`}
                    />
                    {auto ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-5 shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                        title={`Auto-filled from ${auto}`}
                        data-testid={`badge-wa-invoice-var-source-${i + 1}`}
                      >
                        auto · {auto}
                      </Badge>
                    ) : src === "manual" ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-5 shrink-0"
                        title="Manual override"
                        data-testid={`badge-wa-invoice-var-source-${i + 1}`}
                      >
                        manual
                      </Badge>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {tpl && (
            <div className="bg-muted/50 rounded-md p-3 text-xs whitespace-pre-wrap border">
              <p className="text-[10px] text-muted-foreground mb-1 font-medium">Preview</p>
              {previewBody}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!phone || !selectedTemplate || sendMutation.isPending}
            onClick={() => sendMutation.mutate()}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="button-wa-invoice-send"
          >
            {sendMutation.isPending ? "Sending..." : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sales Return status badge ────────────────────────────────────────────────
function returnStatusBadge(status: string) {
  if (status === "processed") return <Badge className="bg-green-100 text-green-800 border-green-200">Processed</Badge>;
  if (status === "draft") return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Draft</Badge>;
  return <Badge className="bg-orange-100 text-orange-800 border-orange-200">{status}</Badge>;
}

type SalesReturnSummary = {
  id: string;
  returnNumber: string;
  invoiceId: string;
  invoiceNumber?: string;
  customerName?: string;
  returnType: string;
  reason: string | null;
  status: string;
  grandTotal: string | null;
  createdAt: string;
};

// ─── Main Page ───────────────────────────────────────────────────────────────
const SHOW_SALES_RETURNS = false; // Phase 3: hidden from UI; keep to re-enable later

export default function SalesInvoices() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<"invoices" | "returns">("invoices");
  const [uploadFilter, setUploadFilter] = useState<"all" | "pending_upload" | "recorded">("all");

  // Phase 3 D3: redirect ?tab=returns to invoices tab
  useEffect(() => {
    if (!SHOW_SALES_RETURNS) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "returns") {
        window.history.replaceState({}, "", "/sales-invoices");
        setActiveView("invoices");
      }
    }
  }, []);

  const { data: invoices = [], isLoading } = useQuery<SalesInvoice[]>({ queryKey: ["/api/sales-invoices"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: allReturns = [], isLoading: returnsLoading } = useQuery<SalesReturnSummary[]>({ queryKey: ["/api/sales-returns"] });

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    if (q) {
      const customer = customers.find((c) => c.id === inv.customerId);
      if (!(inv.invoiceNumber.toLowerCase().includes(q) || customer?.name?.toLowerCase().includes(q) || inv.status.toLowerCase().includes(q))) return false;
    }
    if (uploadFilter !== "all" && (inv as any).uploadStatus !== uploadFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page-level tab bar */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b bg-background">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeView === "invoices" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveView("invoices")}
          data-testid="tab-invoices"
        >
          <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />Invoices
        </button>
        {SHOW_SALES_RETURNS && (
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeView === "returns" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => setActiveView("returns")}
            data-testid="tab-returns"
          >
            <RotateCcw className="w-4 h-4 inline mr-1.5 -mt-0.5" />Sales Returns
            {allReturns.length > 0 && (
              <span className="ml-1.5 bg-muted text-muted-foreground text-xs rounded-full px-1.5 py-0.5">{allReturns.length}</span>
            )}
          </button>
        )}
      </div>

      {(SHOW_SALES_RETURNS && activeView === "returns") ? (
        /* ── Sales Returns view ────────────────────────── */
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/30 flex items-center justify-between">
            <h2 className="font-semibold text-sm">All Sales Returns &amp; Credit Notes</h2>
            <span className="text-xs text-muted-foreground">{allReturns.length} return{allReturns.length !== 1 ? "s" : ""}</span>
          </div>
          <ScrollArea className="flex-1">
            {returnsLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading returns…</div>
            ) : allReturns.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No sales returns recorded yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">Return #</TableHead>
                    <TableHead className="text-xs">Invoice #</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Credit Value</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allReturns.map((ret) => (
                    <TableRow key={ret.id} data-testid={`row-return-${ret.id}`}>
                      <TableCell className="font-mono text-xs font-semibold">{ret.returnNumber}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{ret.invoiceNumber ?? "—"}</TableCell>
                      <TableCell className="text-sm">{ret.customerName ?? "—"}</TableCell>
                      <TableCell className="text-xs capitalize">{ret.returnType?.replace(/_/g, " ")}</TableCell>
                      <TableCell>{returnStatusBadge(ret.status)}</TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        {ret.grandTotal ? fmt(ret.grandTotal) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ret.createdAt ? new Date(ret.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>
      ) : (
      /* ── Invoices two-pane view ─────────────────────── */
      <div className="flex flex-1 overflow-hidden">
      {/* ── List pane (40% desktop, full-width mobile) ── */}
      <div className={`flex flex-col border-r bg-background ${mobileDetailOpen ? "hidden md:flex" : "flex"} md:w-[40%] lg:w-[38%] xl:w-[36%] w-full flex-shrink-0`}>
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <h1 className="text-base font-bold truncate">Sales Invoices</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 w-36 text-sm"
                data-testid="input-search-invoices"
              />
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-create-invoice-open">
              <Plus className="w-3.5 h-3.5 mr-1" /> New
            </Button>
          </div>
        </div>

        {/* Upload Status Filter */}
        <div className="flex items-center gap-1 px-4 py-2 border-b bg-muted/20">
          {(["all", "pending_upload", "recorded"] as const).map((f) => (
            <button
              key={f}
              data-testid={`filter-upload-${f}`}
              onClick={() => setUploadFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${uploadFilter === f ? "bg-primary text-primary-foreground border-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            >
              {f === "all" ? "All" : f === "pending_upload" ? "Pending" : "Recorded"}
              <span className="ml-1 opacity-60">({invoices.filter(i => f === "all" || (i as any).uploadStatus === f).length})</span>
            </button>
          ))}
        </div>

        {/* Invoice List — compact rows */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading invoices…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {search ? "No invoices match your search." : "No invoices yet. Create one from a dispatched delivery challan."}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((inv) => {
                const customer = customers.find((c) => c.id === inv.customerId);
                const isSelected = selectedId === inv.id;
                return (
                  <button
                    key={inv.id}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors border-l-2 ${isSelected ? "bg-primary/5 border-l-primary" : "border-l-transparent"}`}
                    style={{ minHeight: "64px" }}
                    onClick={() => {
                      setSelectedId(isSelected ? null : inv.id);
                      if (!isSelected) setMobileDetailOpen(true);
                    }}
                    data-testid={`row-invoice-${inv.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* Left: invoice number + customer */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold text-sm font-mono truncate">{inv.invoiceNumber}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{customer?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          {new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      {/* Right: amount + badges */}
                      <div className="text-right shrink-0 space-y-1">
                        <p className="font-bold text-sm">{fmt(inv.grandTotal)}</p>
                        <div className="flex items-center gap-1 justify-end">
                          {statusBadge(inv.status)}
                          {uploadStatusBadge((inv as any).uploadStatus)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Detail pane (60% desktop, full-screen overlay mobile) ── */}
      <div className={`
        flex-1 overflow-hidden flex flex-col bg-background
        ${mobileDetailOpen ? "fixed inset-0 z-50 md:static md:z-auto" : "hidden md:flex"}
      `}>
        {selectedId ? (
          <>
            {/* Mobile back button */}
            <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b bg-background shrink-0">
              <Button variant="ghost" size="sm" onClick={() => { setMobileDetailOpen(false); }} className="gap-1 text-xs">
                ← Back to list
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <InvoiceDetailPanel invoiceId={selectedId} customers={customers} />
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <FileText className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">Select an invoice to view details</p>
            <p className="text-xs mt-1">GST breakdown, payment history, documents</p>
          </div>
        )}
      </div>

      {createOpen && <CreateInvoiceDialog open={createOpen} onClose={() => setCreateOpen(false)} />}
      </div>
      )}
    </div>
  );
}
