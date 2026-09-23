import { formatGregorianDateTime } from "@shared/dateFormat";
import { trpc } from "@/lib/trpc";
import AuditReasonDialog from "@/components/AuditReasonDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { toast } from "sonner";

function transactionTypeLabel(type: string) {
  if (type === "payment") return "دفعة إيجار";
  if (type === "revenue") return "إيراد";
  if (type === "expense") return "مصروف";
  return type;
}

function paymentMethodLabel(method: string | null) {
  if (method === "cash") return "كاش";
  if (method === "network") return "شبكة";
  if (method === "transfer") return "تحويل";
  if (method === "mixed") return "متعدد";
  return "—";
}

export function FinancialApprovalPanel({ canApprove }: { canApprove: boolean }) {
  const [rejectId, setRejectId] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const transactions = trpc.financialTransactions.list.useQuery(undefined, {
    enabled: canApprove,
  });
  const refresh = () => {
    void Promise.all([
      utils.financialTransactions.list.invalidate(),
      utils.payments.list.invalidate(),
      utils.accounting.invalidate(),
      utils.financialRevenues.list.invalidate(),
      utils.financialExpenses.list.invalidate(),
    ]);
  };
  const approve = trpc.financialTransactions.approve.useMutation({
    onSuccess: () => {
      toast.success("تم اعتماد المعاملة المالية");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const reject = trpc.financialTransactions.reject.useMutation({
    onSuccess: () => {
      toast.success("تم رفض المعاملة المالية وحفظ السبب");
      setRejectId(null);
      refresh();
    },
    onError: error => toast.error(error.message),
  });

  if (!canApprove) return null;

  const pendingRows = (transactions.data ?? []).filter(
    transaction => transaction.approvalStatus === "pending"
  );

  return <><Card className="border-0 shadow-sm"><CardHeader><CardTitle className="text-base">اعتمادات المعاملات المالية</CardTitle><p className="text-xs text-slate-400">المعاملات المعلقة فقط. الاعتماد أو الرفض يُسجل باسم المدير، والرفض يتطلب سبباً إلزامياً.</p></CardHeader><CardContent>{transactions.isLoading ? <p className="py-8 text-center text-sm text-slate-400">جارٍ تحميل المعاملات المعلقة...</p> : transactions.error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">تعذر تحميل المعاملات: {transactions.error.message}</p> : pendingRows.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا توجد معاملات مالية معلقة للاعتماد.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[840px] text-right text-sm"><caption className="sr-only">المعاملات المالية المعلقة للاعتماد</caption><thead><tr className="border-b border-slate-100 text-xs text-slate-400"><th className="p-4">النوع</th><th className="p-4">المبلغ</th><th className="p-4">الطريقة</th><th className="p-4">الوصف</th><th className="p-4">التاريخ</th><th className="p-4">الحالة</th><th className="p-4">الإجراء</th></tr></thead><tbody>{pendingRows.map(transaction => <tr key={transaction.id} className="border-b border-slate-50"><td className="p-4 font-medium">{transactionTypeLabel(transaction.transactionType)}</td><td className="p-4 font-black text-[#d99c1d]">{transaction.amount} ر.س</td><td className="p-4">{paymentMethodLabel(transaction.paymentMethod)}</td><td className="p-4 text-slate-500">{transaction.description?.trim() || "—"}</td><td className="p-4 text-xs text-slate-500">{formatGregorianDateTime(transaction.createdAt)}</td><td className="p-4"><Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50">بانتظار الاعتماد</Badge></td><td className="p-4"><div className="flex gap-2"><Button size="sm" disabled={approve.isPending || reject.isPending} onClick={() => approve.mutate({ id: transaction.id })}>اعتماد</Button><Button size="sm" variant="outline" className="text-red-600" disabled={approve.isPending || reject.isPending} onClick={() => setRejectId(transaction.id)}>رفض</Button></div></td></tr>)}</tbody></table></div>}</CardContent></Card>{rejectId !== null && <AuditReasonDialog title="رفض المعاملة المالية" description="اكتب سبب الرفض الإلزامي. لن تؤثر المعاملة المرفوضة في الإجماليات المعتمدة." pending={reject.isPending} onClose={() => setRejectId(null)} onConfirm={rejectionReason => reject.mutate({ id: rejectId, rejectionReason })} />}</>;
}
