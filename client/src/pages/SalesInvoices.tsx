import { useState } from "react";
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
  FileText, Plus, IndianRupee, CheckCircle2, Clock, AlertCircle,
  ChevronDown, ChevronUp, CreditCard, Building2, User, Search, RotateCcw, RefreshCw,
  MessageCircle, AlertTriangle
} from "lucide-react";
import type { SalesInvoice, SalesInvoiceItem, CustomerPayment, DeliveryChallan, Customer } from "@shared/schema";
import { resolveMergeField, isCommonMergeField, type MergeFieldDocumentContext } from "@shared/mergeFields";

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function statusBadge(status: string) {
  if (status === "paid") return <Badge className="bg-green-100 text-green-800 border-green-200">Paid</Badge>;
  if (status === "partial_paid") return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Partial Paid</Badge>;
  return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Pending</Badge>;
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

  const { data: inv, isLoading } = useQuery<InvoiceWithExtras>({
    queryKey: ["/api/sales-invoices", invoiceId],
    queryFn: () => fetch(`/api/sales-invoices/${invoiceId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
    }).then((r) => r.json()),
    enabled: !!invoiceId,
  });

  // Fetch credit notes for this invoice
  const { data: creditNotes = [] } = useQuery<any[]>({
    queryKey: ["/api/credit-notes"],
    select: (cns) => cns.filter((cn: any) => cn.invoiceId === invoiceId),
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">{inv.invoiceNumber}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            {inv.dueDate && ` · Due ${new Date(inv.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(inv.status)}
          {isB2B ? (
            <Badge variant="outline" className="gap-1"><Building2 className="w-3 h-3" />B2B</Badge>
          ) : (
            <Badge variant="outline" className="gap-1"><User className="w-3 h-3" />B2C</Badge>
          )}
          {customer?.phone && (
            <Button
              size="sm"
              variant="ghost"
              className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
              onClick={() => setWaOpen(true)}
              data-testid={`button-wa-invoice-${inv.id}`}
              title="Send WhatsApp template"
            >
              <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
            </Button>
          )}
        </div>
      </div>

      {/* Customer Info */}
      <Card>
        <CardContent className="p-4 space-y-1">
          <p className="font-medium">{customer?.name ?? "—"}</p>
          {customer?.address && <p className="text-sm text-muted-foreground">{customer.address}</p>}
          {customer?.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
          {isB2B && inv.customerGSTIN && (
            <p className="text-sm font-mono text-blue-600">GSTIN: {inv.customerGSTIN}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {isInterState ? "Inter-State Supply (IGST)" : "Intra-State Supply (CGST + SGST)"}
          </p>
        </CardContent>
      </Card>

      {/* Line Items */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Line Items</h3>
        <div className="rounded-lg border overflow-hidden">
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
                  <TableCell className="text-sm">{item.description}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{item.hsnCode ?? "—"}</TableCell>
                  <TableCell className="text-sm text-right">{Number(item.qty)}</TableCell>
                  <TableCell className="text-sm text-right">{fmt(item.unitPrice)}</TableCell>
                  <TableCell className="text-sm text-right">{fmt(item.taxableAmount)}</TableCell>
                  <TableCell className="text-sm text-right">{Number(item.gstRate)}%</TableCell>
                  {isInterState ? (
                    <TableCell className="text-sm text-right">{fmt(item.igst)}</TableCell>
                  ) : (
                    <>
                      <TableCell className="text-sm text-right">{fmt(item.cgst)}</TableCell>
                      <TableCell className="text-sm text-right">{fmt(item.sgst)}</TableCell>
                    </>
                  )}
                  <TableCell className="text-sm text-right font-medium">{fmt(item.totalAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* GST Summary */}
      <Card className="bg-muted/30">
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{fmt(subtotal)}</span>
          </div>
          <Separator />
          {isInterState ? (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">IGST</span>
              <span>{fmt(totalIgst)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CGST</span>
                <span>{fmt(totalCgst)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SGST</span>
                <span>{fmt(totalSgst)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Tax</span>
            <span>{fmt(totalTax)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-bold text-base">
            <span>Grand Total</span>
            <span className="text-primary">{fmt(grandTotal)}</span>
          </div>
        </CardContent>
      </Card>

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
                  if (!t) { setVars([]); return; }
                  const ms = t.body?.match(/\{\{(\d+)\}\}/g) || [];
                  const tplVars = t.variables || [];
                  const next = ms.map((_: string, i: number) => {
                    const key = tplVars[i];
                    if (key && isCommonMergeField(key)) {
                      const r = resolveMergeField(key, { customer: customerContext, document: docContext });
                      if (r) return r;
                    }
                    return "";
                  });
                  setVars(next);
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
                      }}
                      placeholder={`Variable ${i + 1}`}
                      data-testid={`input-wa-invoice-var-${i + 1}`}
                    />
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
export default function SalesInvoices() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<"invoices" | "returns">("invoices");

  const { data: invoices = [], isLoading } = useQuery<SalesInvoice[]>({ queryKey: ["/api/sales-invoices"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: allReturns = [], isLoading: returnsLoading } = useQuery<SalesReturnSummary[]>({ queryKey: ["/api/sales-returns"] });

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const customer = customers.find((c) => c.id === inv.customerId);
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      customer?.name?.toLowerCase().includes(q) ||
      inv.status.toLowerCase().includes(q)
    );
  });

  const totalPending = invoices.filter((i) => i.status === "pending").reduce((s, i) => s + Number(i.grandTotal), 0);
  const totalPartial = invoices.filter((i) => i.status === "partial_paid").reduce((s, i) => s + Number(i.grandTotal), 0);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.grandTotal), 0);

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
      </div>

      {activeView === "returns" ? (
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
      {/* List pane */}
      <div className="flex flex-col flex-1 min-w-0 border-r">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-background flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">Sales Invoices</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search invoices…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 w-52"
                data-testid="input-search-invoices"
              />
            </div>
            <Button onClick={() => setCreateOpen(true)} data-testid="button-create-invoice-open">
              <Plus className="w-4 h-4 mr-1" /> New Invoice
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b bg-muted/30">
          <div className="bg-background rounded-lg border p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-orange-500 mb-1">
              <Clock className="w-4 h-4" /> <span className="text-xs font-medium">Pending</span>
            </div>
            <p className="text-lg font-bold">{fmt(totalPending)}</p>
            <p className="text-xs text-muted-foreground">{invoices.filter((i) => i.status === "pending").length} invoices</p>
          </div>
          <div className="bg-background rounded-lg border p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-blue-500 mb-1">
              <AlertCircle className="w-4 h-4" /> <span className="text-xs font-medium">Partial</span>
            </div>
            <p className="text-lg font-bold">{fmt(totalPartial)}</p>
            <p className="text-xs text-muted-foreground">{invoices.filter((i) => i.status === "partial_paid").length} invoices</p>
          </div>
          <div className="bg-background rounded-lg border p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-green-500 mb-1">
              <CheckCircle2 className="w-4 h-4" /> <span className="text-xs font-medium">Paid</span>
            </div>
            <p className="text-lg font-bold">{fmt(totalPaid)}</p>
            <p className="text-xs text-muted-foreground">{invoices.filter((i) => i.status === "paid").length} invoices</p>
          </div>
        </div>

        {/* Invoice List */}
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
                const creditedAmount = Number(inv.creditedAmount ?? 0);
                return (
                  <button
                    key={inv.id}
                    className={`w-full text-left px-6 py-4 hover:bg-muted/50 transition-colors ${isSelected ? "bg-primary/5 border-l-2 border-primary" : ""}`}
                    onClick={() => setSelectedId(isSelected ? null : inv.id)}
                    data-testid={`row-invoice-${inv.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{inv.invoiceNumber}</span>
                          {statusBadge(inv.status)}
                          <Badge variant="outline" className="text-xs">
                            {inv.customerType}
                          </Badge>
                          {creditedAmount > 0 && (
                            <Badge className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                              <RotateCcw className="w-2.5 h-2.5 mr-0.5" />CN
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 truncate">{customer?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          {inv.dueDate && ` · Due ${new Date(inv.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-base">{fmt(inv.grandTotal)}</p>
                        <p className="text-xs text-muted-foreground">incl. GST</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Detail pane */}
      <div className="w-[560px] flex-shrink-0 overflow-hidden flex flex-col bg-background">
        {selectedId ? (
          <ScrollArea className="flex-1">
            <InvoiceDetailPanel invoiceId={selectedId} customers={customers} />
          </ScrollArea>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <FileText className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">Select an invoice to view details</p>
            <p className="text-xs mt-1">including GST breakdown, payment history, and returns</p>
          </div>
        )}
      </div>

      {createOpen && <CreateInvoiceDialog open={createOpen} onClose={() => setCreateOpen(false)} />}
      </div>
      )}
    </div>
  );
}
