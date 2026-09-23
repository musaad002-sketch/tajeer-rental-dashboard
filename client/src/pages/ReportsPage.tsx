import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canPerform } from "@shared/permissions";
import { formatGregorianDate } from "@shared/dateFormat";
import { getOperatingCycle } from "@shared/rentalRules";
import { ArrowDownLeft, ArrowUpLeft, ClipboardList, Coins, Download, FileBarChart, History, Layers3, Loader2, ReceiptText, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";

const statusLabels = { approved: "معتمد", pending: "معلّق", rejected: "مرفوض", legacyAccepted: "مقبول سابقًا" } as const;
const transactionLabels = { revenue: "إيراد", expense: "مصروف", payment: "دفعة" } as const;
const allocationLabels: Record<string, string> = { previous_balance: "رصيد سابق", current_contract: "العقد الحالي", excess_mileage: "كيلومترات إضافية", remaining_contract_balance: "الرصيد المتبقي للعقد", delay: "تأخير", other: "أخرى" };
function money(value: string | number) { return `${Number(value || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`; }
function StatusPill({ status }: { status: keyof typeof statusLabels }) { const styles = { approved: "border-emerald-200 bg-emerald-50 text-emerald-700", pending: "border-amber-200 bg-amber-50 text-amber-700", rejected: "border-rose-200 bg-rose-50 text-rose-700", legacyAccepted: "border-slate-200 bg-slate-100 text-slate-600" }; return <Badge variant="outline" className={styles[status]}>{statusLabels[status]}</Badge>; }
function StatusAmounts({ values }: { values: { approved: string; pending: string; rejected: string; legacyAccepted: string } }) { return <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">{(Object.keys(statusLabels) as Array<keyof typeof statusLabels>).map((status) => <div key={status} className="rounded-xl bg-slate-50 p-3"><div className="mb-1 flex items-center justify-between gap-2 text-slate-500"><span>{statusLabels[status]}</span><StatusPill status={status} /></div><strong className="block text-sm text-slate-800">{money(values[status])}</strong></div>)}</div>; }

export default function ReportsPage() {
  const { user } = useAuth();
  const [cycleOffset, setCycleOffset] = useState(0);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const canView = canPerform(user?.role ?? "user", user?.permissions, "accounting.view");
  const cycleDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + cycleOffset);
    return d.toISOString();
  }, [cycleOffset]);
  const cycle = useMemo(() => getOperatingCycle(new Date(cycleDate)), [cycleDate]);
  const utils = trpc.useUtils();
  const report = trpc.financialReporting.readModel.useQuery({ cycleDate }, { enabled: Boolean(user && canView) });
  const { data: annualReport, isLoading: annualLoading } = trpc.financialReporting.annual.useQuery(
    { year: selectedYear },
    { enabled: Boolean(user && canView) }
  );
  const handleExport = async (type: "financial" | "payments" | "expenses") => {
    try {
      const procedure = type === "financial"
        ? utils.exports.financialCsv
        : type === "payments"
          ? utils.exports.paymentsCsv
          : utils.exports.expensesCsv;
      const result = await procedure.fetch({ cycleDate });
      const blob = new Blob(["\uFEFF" + result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تصدير التقرير");
    }
  };
  const model = report.data;
  if (!canView) return <DashboardLayout><div dir="rtl" className="mx-auto max-w-5xl"><Card><CardContent className="p-10 text-center text-slate-500">التقارير المالية متاحة للحسابات المصرّح لها فقط.</CardContent></Card></div></DashboardLayout>;
  if (report.isLoading) return <DashboardLayout><div dir="rtl" className="flex min-h-[55vh] items-center justify-center text-sm text-slate-500"><Loader2 className="ml-2 h-5 w-5 animate-spin text-[#139f95]" />جارٍ تحميل التقارير المالية...</div></DashboardLayout>;
  if (report.error || !model) return <DashboardLayout><div dir="rtl" className="mx-auto max-w-5xl"><Card className="border-rose-100"><CardContent className="p-10 text-center text-sm text-rose-700">تعذر تحميل التقرير المالي: {report.error?.message ?? "لا توجد بيانات"}</CardContent></Card></div></DashboardLayout>;
  const { summary, transactions, allocations } = model; const netApproved = Number(summary.revenue.approved) - Number(summary.expense.approved);
  return <DashboardLayout><div dir="rtl" className="mx-auto max-w-7xl space-y-6">
    <Card className="border-0 shadow-sm"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-xs text-slate-500">دورة التشغيل الحالية</p><p className="mt-1 font-black text-[#172235]">{formatGregorianDate(cycle.start)} – {formatGregorianDate(cycle.end)}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setCycleOffset(offset => offset - 1)}>الدورة السابقة</Button><Button variant={cycleOffset === 0 ? "default" : "outline"} onClick={() => setCycleOffset(0)}>الحالية</Button><Button variant="outline" onClick={() => setCycleOffset(offset => offset + 1)}>الدورة التالية</Button></div></CardContent></Card>
    <section className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => handleExport("financial")}><Download className="ml-2 h-4 w-4" />تصدير كل الحركات (CSV)</Button><Button variant="outline" onClick={() => handleExport("payments")}><Download className="ml-2 h-4 w-4" />تصدير الدفعات (CSV)</Button><Button variant="outline" onClick={() => handleExport("expenses")}><Download className="ml-2 h-4 w-4" />تصدير المصروفات (CSV)</Button></section>
    <header className="rounded-3xl bg-[#0b2747] p-6 text-white shadow-sm md:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="mb-2 flex items-center gap-2 text-sm font-bold text-[#77d6cd]"><FileBarChart className="h-4 w-4" />المحاسبة · تقارير مالية</p><h1 className="text-3xl font-black tracking-tight md:text-4xl">لوحة التقارير المالية</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">قراءة موحّدة للإيرادات والمصروفات والدفعات والتخصيصات. يتم احتساب الأرقام الفعّالة مرة واحدة فقط، مع إبقاء التصحيحات والقيود العكسية كسجل تدقيقي.</p></div><div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-left"><p className="text-xs text-slate-300">صافي المعتمد</p><p className="mt-1 text-2xl font-black text-[#a9eee8]">{money(netApproved)}</p><p className="mt-1 text-[11px] text-slate-300">إيرادات معتمدة − مصروفات معتمدة</p></div></div></header>
    <section className="grid gap-4 md:grid-cols-3" aria-label="الإجماليات المالية المعتمدة">{[{ key: "revenue", label: "الإيرادات", icon: ArrowUpLeft, value: summary.revenue.approved, tone: "text-emerald-700", bg: "bg-emerald-50" }, { key: "expense", label: "المصروفات", icon: ArrowDownLeft, value: summary.expense.approved, tone: "text-rose-700", bg: "bg-rose-50" }, { key: "payment", label: "الدفعات", icon: WalletCards, value: summary.payment.approved, tone: "text-[#0c8f87]", bg: "bg-[#effaf8]" }].map((item) => { const Icon = item.icon; return <Card key={item.key} className="border-0 shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><div className={`rounded-2xl p-3 ${item.bg}`}><Icon className={`h-5 w-5 ${item.tone}`} /></div><StatusPill status="approved" /></div><p className="mt-5 text-sm font-bold text-slate-500">{item.label}</p><p className={`mt-1 text-2xl font-black ${item.tone}`}>{money(item.value)}</p><StatusAmounts values={summary[item.key as "revenue" | "expense" | "payment"]} /></CardContent></Card>; })}</section>
    <section className="grid gap-4 md:grid-cols-2"><Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Layers3 className="h-5 w-5 text-[#139f95]" />إجمالي allocations</CardTitle></CardHeader><CardContent className="flex items-end justify-between gap-4"><div><p className="text-3xl font-black text-[#0c8f87]">{money(summary.approvedAllocations.total)}</p><p className="mt-2 text-xs text-slate-500">{summary.approvedAllocations.count.toLocaleString("ar-SA")} تخصيصات لدفعات معتمدة</p></div><ClipboardList className="h-10 w-10 text-slate-200" /></CardContent></Card><Card className="border-0 bg-slate-50 shadow-sm"><CardContent className="flex items-center gap-4 p-5"><History className="h-8 w-8 shrink-0 text-[#d99c1d]" /><div><p className="font-black text-[#172235]">قراءة آمنة بلا double-counting</p><p className="mt-1 text-xs leading-6 text-slate-500">التصحيح والعكس لا يعدّلان السجل الأصلي؛ يعرضهما التقرير ضمن الحركة الفعّالة وفق read model المعتمد.</p></div></CardContent></Card></section>
    <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ReceiptText className="h-5 w-5 text-[#139f95]" />الحركات المالية الفعّالة</CardTitle><p className="text-xs text-slate-400">تشمل approved وlegacy_accepted بعد تطبيق قواعد التصحيح والعكس، بينما تظهر حالات pending وrejected في الإجماليات أعلاه.</p></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><caption className="sr-only">الحركات المالية الفعالة</caption><thead><tr className="border-b border-slate-100 text-xs text-slate-400"><th className="p-3">المرجع</th><th className="p-3">النوع</th><th className="p-3">المبلغ</th><th className="p-3">الحالة</th><th className="p-3">المصدر</th><th className="p-3">المعالجة</th></tr></thead><tbody>{transactions.length ? transactions.map((row) => { const status = row.approvalStatus === "legacy_accepted" ? "legacyAccepted" : "approved"; const isCorrection = Boolean(row.correctionOfTransactionId); const isReversal = Boolean(row.reversalOfTransactionId); return <tr key={row.id} className="border-b border-slate-50 last:border-0"><td className="p-3 font-mono text-xs text-slate-600">#{row.id}</td><td className="p-3 font-bold text-slate-700">{transactionLabels[row.transactionType]}</td><td className={`p-3 font-black ${isReversal ? "text-rose-700" : "text-slate-800"}`}>{isReversal ? "−" : ""}{money(row.amount)}</td><td className="p-3"><StatusPill status={status} /></td><td className="p-3 text-xs text-slate-500">{row.sourceTable ? `${row.sourceTable}${row.sourceId ? ` · ${row.sourceId}` : ""}` : "—"}</td><td className="p-3 text-xs text-slate-500">{isCorrection ? `تصحيح للسجل #${row.correctionOfTransactionId}` : isReversal ? `عكس للسجل #${row.reversalOfTransactionId}` : "حركة أصلية"}</td></tr>; }) : <tr><td colSpan={6} className="p-10 text-center text-slate-400">لا توجد حركات فعّالة للعرض.</td></tr>}</tbody></table></div></CardContent></Card>
    <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Coins className="h-5 w-5 text-[#139f95]" />تفاصيل allocations</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-right text-sm"><caption className="sr-only">تفاصيل allocations المعتمدة</caption><thead><tr className="border-b border-slate-100 text-xs text-slate-400"><th className="p-3">التخصيص</th><th className="p-3">الدفعة</th><th className="p-3">العقد</th><th className="p-3">الفئة</th><th className="p-3">الأولوية</th><th className="p-3">المبلغ</th></tr></thead><tbody>{allocations.length ? allocations.map((row) => <tr key={row.id} className="border-b border-slate-50 last:border-0"><td className="p-3 font-mono text-xs">#{row.id}</td><td className="p-3 text-slate-600">{row.paymentId ? `#${row.paymentId}` : "—"}</td><td className="p-3 text-slate-600">{row.contractId ? `#${row.contractId}` : "—"}</td><td className="p-3 font-semibold text-slate-700">{allocationLabels[row.allocationType] ?? row.allocationType}</td><td className="p-3 text-slate-500">{row.priority}</td><td className="p-3 font-black text-[#0c8f87]">{money(row.amount)}</td></tr>) : <tr><td colSpan={6} className="p-10 text-center text-slate-400">لا توجد allocations مرتبطة بدفعات معتمدة.</td></tr>}</tbody></table></div></CardContent></Card>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">التقرير السنوي</h2>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setSelectedYear(year => year - 1)}>السنة السابقة</Button>
          <span className="text-lg font-bold tabular-nums">{selectedYear}</span>
          <Button variant="outline" onClick={() => setSelectedYear(year => year + 1)}>السنة التالية</Button>
        </div>
      </div>
      {annualLoading ? (
        <p className="text-slate-500">جارٍ التحميل...</p>
      ) : annualReport ? (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-green-50 p-3">
              <p className="text-xs text-green-700">إجمالي الإيرادات</p>
              <p className="text-lg font-bold text-green-900">{annualReport.totals.revenues.toFixed(2)} ر.س</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-xs text-red-700">إجمالي المصروفات</p>
              <p className="text-lg font-bold text-red-900">{annualReport.totals.expenses.toFixed(2)} ر.س</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="text-xs text-blue-700">إجمالي الدفعات</p>
              <p className="text-lg font-bold text-blue-900">{annualReport.totals.payments.toFixed(2)} ر.س</p>
            </div>
            <div className={`rounded-lg p-3 ${annualReport.totals.net >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
              <p className={`text-xs ${annualReport.totals.net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>الصافي</p>
              <p className={`text-lg font-bold ${annualReport.totals.net >= 0 ? "text-emerald-900" : "text-rose-900"}`}>
                {annualReport.totals.net.toFixed(2)} ر.س
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2">الدورة</th>
                  <th className="p-2">من</th>
                  <th className="p-2">إلى</th>
                  <th className="p-2">الإيرادات</th>
                  <th className="p-2">المصروفات</th>
                  <th className="p-2">الدفعات</th>
                  <th className="p-2">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {annualReport.monthly.map(month => (
                  <tr key={month.label} className="border-t hover:bg-slate-50">
                    <td className="p-2 font-medium">{month.label}</td>
                    <td className="p-2 text-slate-600">{month.cycleStart}</td>
                    <td className="p-2 text-slate-600">{month.cycleEnd}</td>
                    <td className="p-2 text-green-700">{month.revenues.toFixed(2)}</td>
                    <td className="p-2 text-red-700">{month.expenses.toFixed(2)}</td>
                    <td className="p-2">{month.payments.toFixed(2)}</td>
                    <td className={`p-2 font-bold ${month.net >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {month.net.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-bold">
                <tr>
                  <td className="p-2" colSpan={3}>الإجمالي السنوي</td>
                  <td className="p-2 text-green-800">{annualReport.totals.revenues.toFixed(2)}</td>
                  <td className="p-2 text-red-800">{annualReport.totals.expenses.toFixed(2)}</td>
                  <td className="p-2">{annualReport.totals.payments.toFixed(2)}</td>
                  <td className={`p-2 ${annualReport.totals.net >= 0 ? "text-green-800" : "text-red-800"}`}>
                    {annualReport.totals.net.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <p className="text-slate-500">لا توجد بيانات لهذه السنة.</p>
      )}
    </section>
  </div></DashboardLayout>;
}
