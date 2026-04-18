import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getUser } from "@/lib/auth";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { todayIST } from "@shared/datetime";
import type { Expense, ExpenseCategory, Customer, SalesOrder, DeliveryChallan, Project, PurchaseOrder, GoodsReceiptNote, User } from "@shared/schema";

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

interface ExpensePayload {
  categoryId: string;
  amount: string;
  paymentMethod: string;
  expenseDate: string;
  description: string;
  vendorName: string | null;
  paidByUserId: string;
  notes: string | null;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
}

function toDateInput(value: string | Date): string {
  if (typeof value === "string") return value.split("T")[0];
  return value.toISOString().split("T")[0];
}

export default function ExpenseDialog({ open, onOpenChange, expense, defaultLinked }: ExpenseDialogProps) {
  const { toast } = useToast();
  const currentUser = getUser();
  const isPrivileged = currentUser?.role === "admin" || currentUser?.role === "accountant";
  const today = todayIST();

  // After create, we keep the dialog open and switch into "saved" mode so the user can attach files.
  const [savedExpenseId, setSavedExpenseId] = useState<string | null>(null);
  const editingExpense = expense ?? null;
  const effectiveExpenseId = editingExpense?.id ?? savedExpenseId;
  const isEdit = !!editingExpense || !!savedExpenseId;

  const [form, setForm] = useState({
    categoryId: "",
    amount: "",
    paymentMethod: "cash",
    expenseDate: today,
    description: "",
    vendorName: "",
    paidByUserId: "",
    notes: "",
    linkedEntityType: "none",
    linkedEntityId: "",
  });
  const [showOptional, setShowOptional] = useState(false);

  useEffect(() => {
    if (!open) { setSavedExpenseId(null); return; }
    if (editingExpense) {
      setForm({
        categoryId: editingExpense.categoryId,
        amount: String(editingExpense.amount),
        paymentMethod: editingExpense.paymentMethod,
        expenseDate: toDateInput(editingExpense.expenseDate),
        description: editingExpense.description,
        vendorName: editingExpense.vendorName ?? "",
        paidByUserId: editingExpense.paidByUserId,
        notes: editingExpense.notes ?? "",
        linkedEntityType: editingExpense.linkedEntityType ?? "none",
        linkedEntityId: editingExpense.linkedEntityId ?? "",
      });
      setShowOptional(!!(editingExpense.vendorName || editingExpense.notes || editingExpense.linkedEntityType));
    } else {
      setForm({
        categoryId: "",
        amount: "",
        paymentMethod: "cash",
        expenseDate: today,
        description: "",
        vendorName: "",
        paidByUserId: currentUser?.id ?? "",
        notes: "",
        linkedEntityType: defaultLinked?.entityType ?? "none",
        linkedEntityId: defaultLinked?.entityId ?? "",
      });
      setShowOptional(!!defaultLinked);
    }
  }, [open, editingExpense, defaultLinked, currentUser?.id, today]);

  const { data: categories } = useQuery<ExpenseCategory[]>({ queryKey: ["/api/expense-categories"], enabled: open });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"], enabled: open && isPrivileged });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: open && form.linkedEntityType === "customer" });
  const { data: salesOrders } = useQuery<SalesOrder[]>({ queryKey: ["/api/sales-orders"], enabled: open && form.linkedEntityType === "sales_order" });
  const { data: challans } = useQuery<DeliveryChallan[]>({ queryKey: ["/api/delivery-challans"], enabled: open && form.linkedEntityType === "delivery_challan" });
  const { data: projects } = useQuery<Project[]>({ queryKey: ["/api/projects"], enabled: open && form.linkedEntityType === "project" });
  const { data: purchaseOrders } = useQuery<PurchaseOrder[]>({ queryKey: ["/api/purchase-orders"], enabled: open && form.linkedEntityType === "purchase_order" });
  const { data: grns } = useQuery<GoodsReceiptNote[]>({ queryKey: ["/api/grns"], enabled: open && form.linkedEntityType === "goods_receipt_note" });

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

  const mutation = useMutation<Expense, Error, ExpensePayload>({
    mutationFn: async (data: ExpensePayload) => {
      const url = editingExpense ? `/api/expenses/${editingExpense.id}` : "/api/expenses";
      const method = editingExpense ? "PATCH" : "POST";
      const res = await apiRequest(method, url, data);
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { message?: string }));
        throw new Error(body.message || "Failed to save expense");
      }
      return res.json() as Promise<Expense>;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics"] });
      if (editingExpense) {
        toast({ title: "Expense updated" });
        onOpenChange(false);
      } else {
        toast({ title: "Expense recorded — you can now attach receipts." });
        setSavedExpenseId(saved.id);
        setShowOptional(true);
      }
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (savedExpenseId) { onOpenChange(false); return; }
    if (!form.categoryId) { toast({ title: "Select a category", variant: "destructive" }); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    if (!form.description.trim()) { toast({ title: "Description is required", variant: "destructive" }); return; }
    if (!form.paidByUserId) { toast({ title: "Select who paid this expense", variant: "destructive" }); return; }
    const payload: ExpensePayload = {
      categoryId: form.categoryId,
      amount: form.amount,
      paymentMethod: form.paymentMethod,
      expenseDate: form.expenseDate,
      description: form.description.trim(),
      vendorName: form.vendorName.trim() || null,
      paidByUserId: form.paidByUserId,
      notes: form.notes.trim() || null,
      linkedEntityType: form.linkedEntityType === "none" ? null : form.linkedEntityType,
      linkedEntityId: form.linkedEntityType === "none" || !form.linkedEntityId ? null : form.linkedEntityId,
    };
    mutation.mutate(payload);
  };

  const formDisabled = !!savedExpenseId; // After save, lock fields and surface attachments

  // Safety net: when the dialog closes after a successful create, re-invalidate
  // the expenses caches. The mutation onSuccess invalidation can race with
  // unmounted-observer behaviour (e.g. the user opened the dialog from the
  // Dashboard while the Accounts → Expenses list isn't yet mounted), so we
  // also fire on every close path (Done button, X button, overlay click, Esc).
  const handleOpenChange = (next: boolean) => {
    if (!next && savedExpenseId) {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attachments", "expense", savedExpenseId] });
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-testid="dialog-expense">
        <DialogHeader>
          <DialogTitle>{editingExpense ? "Edit Expense" : savedExpenseId ? "Expense Recorded" : "Record Expense"}</DialogTitle>
        </DialogHeader>

        {savedExpenseId && (
          <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800" data-testid="banner-expense-saved">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              Saved successfully. Attach any receipts or invoices below, then close when you're done.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={formDisabled} className="space-y-4 disabled:opacity-70">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="exp-category">Category *</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                  <SelectTrigger id="exp-category" data-testid="select-expense-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).filter(c => c.isActive || c.id === form.categoryId).map(c => (
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
              <Label htmlFor="exp-paid-by">Paid By *</Label>
              {isPrivileged ? (
                <Select value={form.paidByUserId} onValueChange={(v) => setForm({ ...form, paidByUserId: v })}>
                  <SelectTrigger id="exp-paid-by" data-testid="select-expense-paid-by"><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {(users ?? []).map(u => (
                      <SelectItem key={u.id} value={u.id} data-testid={`option-paid-by-${u.id}`}>
                        {u.fullName} {u.id === currentUser?.id ? "(you)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input id="exp-paid-by" value={currentUser?.fullName ?? ""} readOnly disabled data-testid="input-expense-paid-by-self" />
              )}
            </div>
            <div>
              <Label htmlFor="exp-desc">Description *</Label>
              <Textarea id="exp-desc" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What was this expense for?" rows={2} maxLength={500} data-testid="input-expense-description" required />
            </div>

            <button
              type="button"
              onClick={() => setShowOptional(s => !s)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover-elevate active-elevate-2 px-2 py-1 -mx-2 rounded-md"
              data-testid="button-toggle-optional"
            >
              {showOptional ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              {showOptional ? "Hide optional details" : "Add more details (vendor, notes, link)"}
            </button>

            {showOptional && (
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="exp-vendor">Vendor / Paid To</Label>
                    <Input id="exp-vendor" value={form.vendorName} onChange={e => setForm({ ...form, vendorName: e.target.value })} placeholder="Optional" maxLength={200} data-testid="input-expense-vendor" />
                  </div>
                  <div>
                    <Label htmlFor="exp-link-type">Link To</Label>
                    <Select value={form.linkedEntityType} onValueChange={(v) => setForm({ ...form, linkedEntityType: v, linkedEntityId: "" })}>
                      <SelectTrigger id="exp-link-type" data-testid="select-expense-linked-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LINKED_ENTITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.linkedEntityType !== "none" && (
                  <div>
                    <Label htmlFor="exp-link-id">Linked Record</Label>
                    <Select value={form.linkedEntityId} onValueChange={(v) => setForm({ ...form, linkedEntityId: v })}>
                      <SelectTrigger id="exp-link-id" data-testid="select-expense-linked-id"><SelectValue placeholder="Choose..." /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        {linkedOptions.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label htmlFor="exp-notes">Notes</Label>
                  <Textarea id="exp-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any internal notes..." rows={2} data-testid="input-expense-notes" />
                </div>
              </div>
            )}
          </fieldset>

          {isEdit && effectiveExpenseId && (
            <div className="border-t pt-3">
              <Label className="text-sm font-medium mb-2 block">Attachments (PDF, JPG, PNG • max 10 MB each)</Label>
              <AttachmentsPanel entityType="expense" entityId={effectiveExpenseId} module="accounts" />
            </div>
          )}

          <DialogFooter>
            {savedExpenseId ? (
              <Button type="button" onClick={() => onOpenChange(false)} data-testid="button-done-expense">Done</Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-expense">Cancel</Button>
                <Button type="submit" disabled={mutation.isPending} data-testid="button-save-expense">
                  {mutation.isPending ? "Saving..." : editingExpense ? "Update Expense" : "Record Expense"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
