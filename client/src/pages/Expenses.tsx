import ExpensesTab from "@/components/ExpensesTab";

export default function Expenses() {
  return (
    <div className="p-4 space-y-4" data-testid="page-expenses">
      <div>
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <p className="text-sm text-muted-foreground">Record and review operational expenses.</p>
      </div>
      <ExpensesTab />
    </div>
  );
}
