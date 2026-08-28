import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowRight, History } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const labels: Record<string, string> = { new_contract: "عقد جديد", extension: "تمديد", payment: "دفعة", vehicle_swap: "تبديل سيارة", suspend: "تعليق", close: "إغلاق", return: "استرجاع" };

export default function ContractHistoryPage() {
  const [, setLocation] = useLocation();
  const [contractId, setContractId] = useState("");
  const [submittedId, setSubmittedId] = useState("");
  const history = trpc.operations.history.useQuery({ contractId: Number(submittedId) }, { enabled: Boolean(submittedId) && Number(submittedId) > 0 });
  return <DashboardLayout><div className="mx-auto max-w-4xl space-y-6"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => setLocation("/")}><ArrowRight className="h-5 w-5" /></Button><div><p className="mb-1 text-xs font-bold text-[#139f95]">التدقيق والمتابعة</p><h1 className="text-3xl font-black">السجل التاريخي للعقد</h1></div></div><Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-5 w-5 text-[#139f95]" /> البحث برقم العقد</CardTitle></CardHeader><CardContent><div className="flex gap-2"><Input value={contractId} onChange={(e) => setContractId(e.target.value)} placeholder="مثال: 1024" /><Button onClick={() => setSubmittedId(contractId.trim())} className="bg-[#13a99f] hover:bg-[#0d938b]">عرض السجل</Button></div>{history.isLoading && <p className="mt-4 text-xs text-slate-400">جارٍ تحميل السجل...</p>}{history.error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">تعذر تحميل السجل: {history.error.message}</p>}{submittedId && !history.isLoading && !history.error && !history.data?.length && <p className="mt-4 text-xs text-slate-400">لا توجد عمليات مسجلة لهذا العقد.</p>}{history.data?.map((operation) => <div key={operation.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs"><div><p className="font-bold text-slate-700">{labels[operation.operation] ?? operation.operation}</p><p className="mt-1 text-slate-400">{operation.createdAt.toLocaleString("ar-SA")}</p></div><div className="text-left"><p className="text-slate-500">{operation.details ?? "—"}</p><p className="mt-1 font-semibold text-[#d99c1d]">{operation.amount} ر.س</p></div></div>)}</CardContent></Card></div></DashboardLayout>;
}
