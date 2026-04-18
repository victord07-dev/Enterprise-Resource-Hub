import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Expense, ExpenseCategory, Customer, SalesOrder, DeliveryChallan, Project, PurchaseOrder, GoodsReceiptNote } from "@shared/schema";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];

const LINKED_ENTITY_TYPES = [
  { value: "none", label: "Not linked" },
  { value: "sales_order", label: "Sales Order" },
  { value: "delivery_challan", label: "Delivery Challan" },
  { value: "customer", label: "Customer" },
  { value: "project", label: "Project" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "goods_receipt_note", label: "GRN" },
];

interface ExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
  defaultLinked?: { entityType: string; entityId: string } | null;
}

export default function ExpenseDialog({ open, onOpenChange, expense, defaultLinked }: ExpenseDialogProps) {
  const { toast } = useToast();
  const isEdit = !!expense;
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    categoryId: "",
    amount: "",
    paymentMethod: "cash",
    expenseDate: today,
    description: "",
    vendorName: "",
    paymentReference: "",
    linkedEntityType: "none",
    linkedEntityId: "",
  });

  useEffect(() => {
    if (!open) return;
    if (expense) {
      setForm({
        categoryId: expense.categoryId,
        amount: String(expense.amount),
        paymentMethod: expense.paymentMethod,
        expenseDate: new Date(expense.expenseDate).toISOString().split("T")[0],
        description: expense.description,
        vendorName: expense.vendorName ?? "",
        paymentReference: expense.paymentReference ?? "",
        linkedEntityType: expense.linkedEntityType ?? "none",
        linkedEntityId: expense.linkedEntityId ?? "",
      });
    } else {
      setForm({
        categoryId: "",
        amount: "",
        paymentMethod: "cash",
        expenseDate: today,
        description: "",
        vendorName: "",
        paymentReference: "",
        linkedEntityType: defaultLinked?.entityType ?? "none",
        linkedEntityId: defaultLinked?.entityId ?? "",
      });
    }
  }, [open, expense, defaultLinked]);

  const { data: categories } = useQuery<ExpenseCategory[]>({ queryKey: ["/api/expense-categories"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: form.linkedEntityType === "customer" });
  const { data: salesOrders } = useQuery<SalesOrder[]>({ queryKey: ["/api/sales-orders"], enabled: form.linkedEntityType === "sales_order" });
  const { data: challans } = useQuery<DeliveryChallan[]>({ queryKey: ["/api/delivery-challans"], enabled: form.linkedEntityType === "delivery_challan" });
  const { data: projects } = useQuery<Project[]>({ queryKey: ["/api/projects"], enabled: form.linkedEntityType === "project" });
  const { data: purchaseOrders } = useQuery<PurchaseOrder[]>({ queryKey: ["/api/purchase-orders"], enabled: form.linkedEntityType === "purchase_order" });
  const { data: grns } = useQuery<GoodsReceiptNote[]>({ queryKey: ["/api/grns"], enabled: form.linkedEntityType === "goods_receipt_note" });

  const linkedOptions = useMemo(() => {
    switch (form.linkedEntityType) {
      case "customer": return (customers ?? []).map(c => ({ id: c.id, label: c.name }));
      case "sales_order": return (salesOrders ?? []).map(o => ({ id: o.id, label: o.orderNumber }));
      case "delivery_challan": return (challans ?? []).map(c => ({ id: c.id, label: c.challanNumber }));
      case "project": return (projects ?? []).map(p => ({ id: p.id, label: p.name }));
      case "purchase_order": return (purchaseOrders ?? []).map(p => ({ id: p.id, label: p.poNumber }));
      case "goods_receipt_note": return (grns ?? []).map(g => ({ id: g.id, label: g.grnNumber }));
      default: return [];
    }
  }, [form.linkedEntityType, customers, salesOrders, challans, projects, purchaseOrders, grns]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const url = isEdit ? `/api/expenses/${expense!.id}` : "/api/expenses";
      const method = isEdit ? "PATCH" : "POST";
      const res = await apiRequest(method, url, data);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to save expense");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/today-summary"] });
      toast({ title: isEdit ? "Expense updated" : "Expense recorded" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoryId) { toast({ title: "Select a category", variant: "destructive" }); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    if (!form.description.trim()) { toast({ title: "Description is required", variant: "destructive" }); return; }
    const payload: any = {
      categoryId: form.categoryId,
      amount: form.amount,
      paymentMethod: form.paymentMethod,
      expenseDate: new Date(form.expenseDate).toISOString(),
      description: form.description.trim(),
      vendorName: form.vendorName.trim() || null,
      paymentReference: form.paymentReference.trim() || null,
      linkedEntityType: form.linkedEntityType === "none" ? null : form.linkedEntityType,
      linkedEntityId: form.linkedEntityType === "none" || !form.linkedEntityId ? null : form.linkedEntityId,
    };
    mutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="dialog-expense">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Expense" : "Record Expense"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="exp-category">Category *</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                <SelectTrigger id="exp-category" data-testid="select-expense-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map(c => (
                    <SelectItem key={c.id} value={c.id} data-testid={`option-category-${c.id}`}>
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exp-amount">Amount (₹) *</Label>
              <Input id="exp-amount" type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} data-testid="input-expense-amount" required />
            </div>
            <div>
              <Label htmlFor="exp-method">Payment Method *</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                <SelectTrigger id="exp-method" data-testid="select-expense-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exp-date">Date *</Label>
              <Input id="exp-date" type="date" value={form.expenseDate} onChange={e => setForm({ ...form, expenseDate: e.target.value })} data-testid="input-expense-date" required />
            </div>
          </div>
          <div>
            <Label htmlFor="exp-desc">Description *</Label>
            <Textarea id="exp-desc" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What was this expense for?" rows={2} data-testid="input-expense-description" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="exp-vendor">Vendor / Paid To</Label>
              <Input id="exp-vendor" value={form.vendorName} onChange={e => setForm({ ...form, vendorName: e.target.value })} placeholder="Optional" data-testid="input-expense-vendor" />
            </div>
            <div>
              <Label htmlFor="exp-ref">Payment Reference</Label>
              <Input id="exp-ref" value={form.paymentReference} onChange={e => setForm({ ...form, paymentReference: e.target.value })} placeholder="Txn ID, cheque #, etc." data-testid="input-expense-reference" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="exp-link-type">Link To</Label>
              <Select value={form.linkedEntityType} onValueChange={(v) => setForm({ ...form, linkedEntityType: v, linkedEntityId: "" })}>
                <SelectTrigger id="exp-link-type" data-testid="select-expense-linked-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LINKED_ENTITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.linkedEntityType !== "none" && (
              <div>
                <Label htmlFor="exp-link-id">Select</Label>
                <Select value={form.linkedEntityId} onValueChange={(v) => setForm({ ...form, linkedEntityId: v })}>
                  <SelectTrigger id="exp-link-id" data-testid="select-expense-linked-id"><SelectValue placeholder="Choose..." /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {linkedOptions.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-expense">Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-save-expense">
              {mutation.isPending ? "Saving..." : isEdit ? "Update Expense" : "Record Expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
