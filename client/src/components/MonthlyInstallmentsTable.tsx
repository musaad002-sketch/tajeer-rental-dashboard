import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  contractId: number;
  isMonthly: boolean;
};

type InstallmentStatus = "unpaid" | "partially_paid" | "fully_paid";

const statusLabels: Record<InstallmentStatus, string> = {
  unpaid: "غير مدفوع",
  partially_paid: "مدفوع جزئيًا",
  fully_paid: "مدفوع بالكامل",
};

const statusColors: Record<InstallmentStatus, string> = {
  unpaid: "bg-red-50 text-red-700",
  partially_paid: "bg-amber-50 text-amber-700",
  fully_paid: "bg-green-50 text-green-700",
};

function money(value: string | number) {
  return Number(value).toFixed(2);
}

function date(value: Date | string) {
  return new Intl.DateTimeFormat("ar-SA").format(new Date(value));
}

export function MonthlyInstallmentsTable({ contractId, isMonthly }: Props) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.monthlyInstallments.list.useQuery(
    { contractId },
    { enabled: isMonthly }
  );
  const backfill = trpc.monthlyInstallments.backfill.useMutation({
    onSuccess: async () => {
      toast.success("تم توليد الاستحقاقات الشهرية");
      await utils.monthlyInstallments.list.invalidate({ contractId });
    },
    onError: error => toast.error(error.message),
  });

  if (!isMonthly) return null;
  if (isLoading) {
    return <Card className="border-0 p-4 text-center shadow-sm"><Loader2 className="mx-auto h-5 w-5 animate-spin" /><p className="mt-2 text-sm text-slate-500">جارٍ تحميل الاستحقاقات...</p></Card>;
  }
  if (!data?.length) {
    return <Card className="space-y-3 border-0 p-4 text-center shadow-sm"><p className="text-sm text-slate-500">لا توجد استحقاقات شهرية لهذا العقد.</p><Button variant="outline" size="sm" onClick={() => backfill.mutate({ contractId })} disabled={backfill.isPending}>{backfill.isPending ? "جارٍ التوليد..." : "توليد الاستحقاقات الشهرية"}</Button></Card>;
  }

  const totals = data.reduce((result, row) => {
    result.amount += Number(row.amount);
    result.paid += Number(row.paidAmount);
    return result;
  }, { amount: 0, paid: 0 });

  return <Card className="border-0 p-4 shadow-sm"><h3 className="mb-3 text-base font-bold">الاستحقاقات الشهرية</h3><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-right text-sm"><thead className="bg-slate-50"><tr><th className="p-2">الشهر</th><th className="p-2">من</th><th className="p-2">إلى</th><th className="p-2">القيمة</th><th className="p-2">المدفوع</th><th className="p-2">المتبقي</th><th className="p-2">الحالة</th></tr></thead><tbody>{data.map(row => { const status = row.status as InstallmentStatus; const remaining = Number(row.amount) - Number(row.paidAmount); return <tr key={row.id} className="border-t border-slate-100"><td className="p-2 font-medium">{row.monthNumber}</td><td className="p-2">{date(row.cycleStart)}</td><td className="p-2">{date(row.cycleEnd)}</td><td className="p-2">{money(row.amount)}</td><td className="p-2 text-green-700">{money(row.paidAmount)}</td><td className="p-2 text-red-700">{money(remaining)}</td><td className="p-2"><span className={`rounded px-2 py-1 text-xs ${statusColors[status] ?? "bg-slate-100 text-slate-700"}`}>{statusLabels[status] ?? row.status}</span></td></tr>; })}</tbody><tfoot className="bg-slate-100 font-bold"><tr><td className="p-2" colSpan={3}>الإجمالي</td><td className="p-2">{money(totals.amount)}</td><td className="p-2 text-green-800">{money(totals.paid)}</td><td className="p-2 text-red-800">{money(totals.amount - totals.paid)}</td><td className="p-2" /></tr></tfoot></table></div></Card>;
}
