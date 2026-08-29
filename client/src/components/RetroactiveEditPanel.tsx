import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { FilePenLine, History, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ContractValue = {
  id: number;
  contractNumber: string;
  startDate: string | Date;
  expectedReturnDate: string | Date;
  actualReturnDate: string | Date | null;
  rentalAmount: string | number;
  days: number;
  totalAmount: string | number;
  notes: string | null;
};

type PaymentValue = { id: number; amount: string | number; method: "cash" | "network" | "transfer"; notes: string | null };

function dateValue(value: string | Date | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default function RetroactiveEditPanel({ contract, payments }: { contract: ContractValue; payments: PaymentValue[] }) {
  const utils = trpc.useUtils();
  const [contractOpen, setContractOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState({ startDate: dateValue(contract.startDate), expectedReturnDate: dateValue(contract.expectedReturnDate), actualReturnDate: dateValue(contract.actualReturnDate), rentalAmount: String(contract.rentalAmount), days: String(contract.days), totalAmount: String(contract.totalAmount), notes: contract.notes ?? "" });
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "cash" as PaymentValue["method"], notes: "" });
  const editContract = trpc.contracts.updateRetroactive.useMutation({ onSuccess: async () => { toast.success("تم تعديل العقد بأثر رجعي وحفظ سجل التدقيق"); setContractOpen(false); setReason(""); await Promise.all([utils.contracts.details.invalidate(), utils.contracts.list.invalidate(), utils.accounting.invalidate(), utils.reports.vehicleRevenue.invalidate()]); }, onError: (error) => toast.error(error.message) });
  const editPayment = trpc.payments.updateRetroactive.useMutation({ onSuccess: async () => { toast.success("تم تعديل الدفعة وإعادة حساب المدفوع"); setPaymentOpen(null); setReason(""); await Promise.all([utils.contracts.details.invalidate(), utils.contracts.list.invalidate(), utils.payments.list.invalidate(), utils.accounting.invalidate(), utils.reports.vehicleRevenue.invalidate()]); }, onError: (error) => toast.error(error.message) });
  const saveContract = () => {
    if (!reason.trim()) return toast.error("اكتب سبب التعديل بأثر رجعي");
    editContract.mutate({ id: contract.id, ...form, days: Number(form.days), reason: reason.trim(), actualReturnDate: form.actualReturnDate || null });
  };
  const savePayment = (paymentId: number) => {
    if (!reason.trim()) return toast.error("اكتب سبب تعديل الدفعة بأثر رجعي");
    editPayment.mutate({ id: paymentId, amount: paymentForm.amount || undefined, method: paymentForm.method, notes: paymentForm.notes, reason: reason.trim() });
  };
  return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-5 w-5 text-[#139f95]" />التعديل بأثر رجعي</CardTitle><p className="text-xs leading-5 text-slate-400">يمكن للمدير تصحيح العقد أو أي دفعة مع حفظ القيمة القديمة والجديدة وسبب التعديل في سجل العقد.</p></CardHeader><CardContent className="space-y-3"><Button type="button" variant="outline" className="gap-2" onClick={() => setContractOpen((value) => !value)}><FilePenLine className="h-4 w-4" />{contractOpen ? "إغلاق تعديل العقد" : "تعديل بيانات العقد"}</Button>{contractOpen && <div className="space-y-3 rounded-xl bg-slate-50 p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs text-slate-500">تاريخ البداية<Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label><label className="space-y-1 text-xs text-slate-500">التسليم المتوقع<Input type="date" value={form.expectedReturnDate} onChange={(e) => setForm({ ...form, expectedReturnDate: e.target.value })} /></label><label className="space-y-1 text-xs text-slate-500">التسليم الفعلي<Input type="date" value={form.actualReturnDate} onChange={(e) => setForm({ ...form, actualReturnDate: e.target.value })} /></label><label className="space-y-1 text-xs text-slate-500">سعر الإيجار<Input inputMode="decimal" value={form.rentalAmount} onChange={(e) => setForm({ ...form, rentalAmount: e.target.value })} /></label><label className="space-y-1 text-xs text-slate-500">الأيام<Input inputMode="numeric" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /></label><label className="space-y-1 text-xs text-slate-500">إجمالي العقد<Input inputMode="decimal" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} /></label></div><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="ملاحظات العقد" /><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب التعديل بأثر رجعي (إلزامي)" /><Button type="button" disabled={editContract.isPending} onClick={saveContract} className="gap-2 bg-[#139f95] hover:bg-[#0d938b]"><Save className="h-4 w-4" />حفظ تعديل العقد</Button></div>}<div className="space-y-2 border-t border-slate-100 pt-3"><p className="text-sm font-bold text-slate-700">تعديل الدفعات</p>{payments.length === 0 ? <p className="text-xs text-slate-400">لا توجد دفعات قابلة للتعديل.</p> : payments.map((payment) => <div key={payment.id} className="rounded-xl bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>سند قبض #{payment.id} — {payment.amount} ر.س</span><Button type="button" size="sm" variant="outline" onClick={() => { setPaymentOpen(payment.id); setPaymentForm({ amount: String(payment.amount), method: payment.method, notes: payment.notes ?? "" }); }}>تعديل الدفعة</Button></div>{paymentOpen === payment.id && <div className="mt-3 grid gap-3 sm:grid-cols-2"><Input inputMode="decimal" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="قيمة الدفعة" /><select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value as PaymentValue["method"] })} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="cash">كاش</option><option value="network">شبكة</option><option value="transfer">تحويل</option></select><Textarea className="sm:col-span-2" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="ملاحظات الدفعة" /><Textarea className="sm:col-span-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب تعديل الدفعة بأثر رجعي (إلزامي)" /><Button type="button" disabled={editPayment.isPending} onClick={() => savePayment(payment.id)} className="gap-2 bg-[#139f95] hover:bg-[#0d938b]"><Save className="h-4 w-4" />حفظ تعديل الدفعة</Button></div>}</div>)}</div></CardContent></Card>;
}
