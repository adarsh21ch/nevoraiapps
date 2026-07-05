import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { fetchPaymentsForPeriods, fetchStudents, qk } from "@/lib/dashboard-queries";
import {
  candidatePeriods,
  periodKey,
  periodLabel,
  reminderMessage,
  studentDue,
  tenantFeeCycle,
  type DueStatus,
} from "@/lib/fees";
import { getFeatures } from "@/lib/tenant";
import { generateReceiptPdf } from "@/lib/receipt-pdf";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  MessageCircle,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/fees")({
  component: FeeRegister,
});

type Filter = "all" | "pending" | "paid";

type RegisterRow = {
  studentId: string;
  name: string;
  batchName: string | null;
  planName: string | null;
  amount: number;
  phone: string;
  guardianName: string | null;
  guardianPhone: string | null;
  due: DueStatus;
  paidPayment: PaidPayment | null;
};

type PaidPayment = {
  id: string;
  receipt_no: number;
  amount: number;
  method: string;
  type: string;
  period: string | null;
  created_at: string;
};

function FeeRegister() {
  const { tenant } = useDashboard();
  const qc = useQueryClient();
  const cycle = tenantFeeCycle(tenant);
  const features = getFeatures(tenant);
  const today = new Date();

  const [monthOffset, setMonthOffset] = useState(0);
  const selectedMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const selectedPeriod = periodKey(selectedMonth);
  const periods = cycle === "joining_date" ? candidatePeriods(today) : [selectedPeriod];

  const [filter, setFilter] = useState<Filter>("all");
  const [payRow, setPayRow] = useState<RegisterRow | null>(null);

  const studentsQ = useQuery({
    queryKey: qk.students(tenant.id),
    queryFn: () => fetchStudents(tenant.id),
  });
  const paymentsQ = useQuery({
    queryKey: qk.feeRegister(tenant.id, periods.join(",")),
    queryFn: () => fetchPaymentsForPeriods(tenant.id, periods),
  });

  const rows: RegisterRow[] = useMemo(() => {
    const paidByStudent = new Map<string, Set<string>>();
    const paymentByStudentPeriod = new Map<string, PaidPayment>();
    for (const p of paymentsQ.data ?? []) {
      if (!p.student_id || !p.period) continue;
      const set = paidByStudent.get(p.student_id) ?? new Set<string>();
      set.add(p.period);
      paidByStudent.set(p.student_id, set);
      paymentByStudentPeriod.set(`${p.student_id}:${p.period}`, p as PaidPayment);
    }

    return (studentsQ.data ?? [])
      .filter((s: any) => s.status === "active" && s.fee_plans?.type === "monthly")
      .map((s: any): RegisterRow => {
        const due = studentDue({
          cycle,
          joinedAt: s.joined_at,
          selectedMonth,
          paidPeriods: paidByStudent.get(s.id) ?? new Set(),
          today,
        });
        const paidPayment =
          due.state === "paid"
            ? (paymentByStudentPeriod.get(`${s.id}:${due.period}`) ?? null)
            : null;
        return {
          studentId: s.id,
          name: s.name,
          batchName: s.batches?.name ?? null,
          planName: s.fee_plans?.name ?? null,
          amount: Number(s.fee_plans?.amount ?? 0),
          phone: s.phone,
          guardianName: s.guardian_name,
          guardianPhone: s.guardian_phone,
          due,
          paidPayment,
        };
      })
      .filter((r) => r.due.state !== "not_due")
      .sort((a, b) => {
        // pending first (most overdue on top), then paid
        const ap = a.due.state === "pending" ? 0 : 1;
        const bp = b.due.state === "pending" ? 0 : 1;
        if (ap !== bp) return ap - bp;
        if (a.due.state === "pending" && b.due.state === "pending")
          return b.due.overdueDays - a.due.overdueDays;
        return a.name.localeCompare(b.name);
      });
  }, [studentsQ.data, paymentsQ.data, cycle, selectedPeriod]);

  const pendingRows = rows.filter((r) => r.due.state === "pending");
  const paidRows = rows.filter((r) => r.due.state === "paid");
  const collectedAmount = paidRows.reduce(
    (s, r) => s + Number(r.paidPayment?.amount ?? r.amount),
    0,
  );
  const pendingAmount = pendingRows.reduce((s, r) => s + r.amount, 0);

  const visible = filter === "pending" ? pendingRows : filter === "paid" ? paidRows : rows;
  const loading = studentsQ.isLoading || paymentsQ.isLoading;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["d", "fees"] });
    qc.invalidateQueries({ queryKey: qk.kpis(tenant.id) });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fees</h1>
          <p className="text-sm text-muted-foreground">
            {cycle === "calendar_month"
              ? "Everyone is due on the 1st of the month"
              : "Each member is due on their monthly joining date"}
          </p>
        </div>
        {cycle === "calendar_month" && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              onClick={() => setMonthOffset((m) => m - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="text-sm font-medium w-36 text-center">
              {format(selectedMonth, "MMMM yyyy")}
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next month"
              disabled={monthOffset >= 0}
              onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </header>

      {/* The two numbers a coach cares about */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Collected</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">
            ₹{collectedAmount.toLocaleString("en-IN")}
          </div>
          <div className="text-xs text-muted-foreground">{paidRows.length} paid</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="mt-1 text-2xl font-bold text-rose-600">
            ₹{pendingAmount.toLocaleString("en-IN")}
          </div>
          <div className="text-xs text-muted-foreground">{pendingRows.length} students</div>
        </Card>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="grid w-full grid-cols-3 max-w-sm">
          <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pendingRows.length})</TabsTrigger>
          <TabsTrigger value="paid">Paid ({paidRows.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="divide-y p-0 overflow-hidden">
        {loading && (
          <div className="p-6 text-sm text-muted-foreground text-center">Loading register…</div>
        )}
        {!loading && visible.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">
            {rows.length === 0
              ? "No active students on a monthly fee plan yet."
              : "Nothing here — try another tab."}
          </div>
        )}
        {visible.map((r) => (
          <FeeRow
            key={r.studentId}
            row={r}
            tenantName={tenant.name}
            whatsappEnabled={features.whatsapp_reminders !== false}
            onCollect={() => setPayRow(r)}
            onReceipt={() => {
              if (!r.paidPayment) return;
              generateReceiptPdf(tenant, {
                receiptNo: r.paidPayment.receipt_no,
                studentName: r.name,
                amount: Number(r.paidPayment.amount),
                type: r.paidPayment.type,
                period: r.paidPayment.period,
                method: r.paidPayment.method,
                paidAt: r.paidPayment.created_at,
              });
            }}
          />
        ))}
      </Card>

      <Dialog open={!!payRow} onOpenChange={(o) => !o && setPayRow(null)}>
        {payRow && (
          <CollectDialog
            row={payRow}
            tenantId={tenant.id}
            onDone={() => {
              setPayRow(null);
              invalidate();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function FeeRow({
  row,
  tenantName,
  whatsappEnabled,
  onCollect,
  onReceipt,
}: {
  row: RegisterRow;
  tenantName: string;
  whatsappEnabled: boolean;
  onCollect: () => void;
  onReceipt: () => void;
}) {
  const due = row.due;
  const remindPhone = (row.guardianPhone || row.phone || "").replace(/\D/g, "");

  return (
    <div className="flex items-center gap-3 p-3 md:p-4">
      <div className="min-w-0 flex-1">
        <Link
          to="/dashboard/students/$id"
          params={{ id: row.studentId }}
          className="font-medium truncate block hover:underline"
        >
          {row.name}
        </Link>
        <div className="text-xs text-muted-foreground truncate">
          {[row.batchName, row.planName].filter(Boolean).join(" · ") || "—"}
        </div>
        {due.state === "pending" && (
          <div className="text-xs mt-0.5">
            {due.overdueDays > 0 ? (
              <span className="text-rose-600 font-medium">Overdue {due.overdueDays}d</span>
            ) : (
              <span className="text-amber-600 font-medium">Due today</span>
            )}
            <span className="text-muted-foreground"> · {periodLabel(due.period)}</span>
          </div>
        )}
        {due.state === "paid" && row.paidPayment && (
          <div className="text-xs mt-0.5 text-muted-foreground">
            Paid {format(new Date(row.paidPayment.created_at), "d MMM")} ·{" "}
            {row.paidPayment.method.toUpperCase()} · #{row.paidPayment.receipt_no}
          </div>
        )}
      </div>

      <div className="text-right shrink-0">
        <div className="font-semibold">₹{row.amount.toLocaleString("en-IN")}</div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {due.state === "pending" ? (
          <>
            {whatsappEnabled && remindPhone && (
              <Button
                asChild
                size="icon"
                variant="outline"
                className="text-[#25D366] border-[#25D366]/40"
                aria-label="Remind on WhatsApp"
              >
                <a
                  href={`https://wa.me/${remindPhone}?text=${encodeURIComponent(
                    reminderMessage({
                      tenantName,
                      studentName: row.name,
                      guardianName: row.guardianName,
                      amount: row.amount,
                      period: due.period,
                    }),
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" />
                </a>
              </Button>
            )}
            <Button
              size="sm"
              onClick={onCollect}
              style={{ backgroundColor: "var(--brand)", color: "white" }}
            >
              Collect
            </Button>
          </>
        ) : (
          <>
            <CheckCircle2 className="size-5 text-emerald-500" />
            <Button size="icon" variant="ghost" aria-label="Download receipt" onClick={onReceipt}>
              <Download className="size-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function CollectDialog({
  row,
  tenantId,
  onDone,
}: {
  row: RegisterRow;
  tenantId: string;
  onDone: () => void;
}) {
  const due = row.due;
  const period = due.state === "pending" ? due.period : periodKey(new Date());
  const [amount, setAmount] = useState(String(row.amount || ""));
  const [note, setNote] = useState("");

  const save = useMutation({
    mutationFn: async (method: "cash" | "upi") => {
      const { error } = await supabase.from("payments").insert({
        tenant_id: tenantId,
        student_id: row.studentId,
        amount: Number(amount),
        type: "monthly",
        period,
        method,
        note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${row.name} marked paid ✓`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disabled = save.isPending || !amount || Number(amount) <= 0;

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>
          {row.name} · {periodLabel(period)}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Amount ₹</Label>
          <Input
            type="number"
            inputMode="numeric"
            className="text-lg font-semibold h-12"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Edit for partial or adjusted amounts — plan is ₹{row.amount.toLocaleString("en-IN")}.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Note (optional)</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. paid half, rest next week"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className={cn("h-14 text-base font-semibold")}
            style={{ backgroundColor: "#16a34a", color: "white" }}
            disabled={disabled}
            onClick={() => save.mutate("cash")}
          >
            <Banknote className="size-5 mr-2" /> Cash ✓
          </Button>
          <Button
            size="lg"
            className="h-14 text-base font-semibold"
            style={{ backgroundColor: "var(--brand)", color: "white" }}
            disabled={disabled}
            onClick={() => save.mutate("upi")}
          >
            <Smartphone className="size-5 mr-2" /> UPI ✓
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
