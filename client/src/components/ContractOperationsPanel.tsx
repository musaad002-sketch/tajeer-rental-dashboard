import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeftRight, Banknote, CarFront, CirclePause, CircleStop, Coins, RotateCcw, TimerReset, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Operation = "extension" | "payment" | "additional_fee" | "rate_update" | "vehicle_swap" | "suspend" | "close" | "return";

const options: Array<{ value: Operation; label: string }> = [
  { value: "payment", label: "استلام مبلغ" },
  { value: "additional_fee", label: "إضافة رسوم" },
  { value: "rate_update", label: "تعديل سعر التأجير" },
  { value: "extension", label: "تمديد العقد" },
  { value: "vehicle_swap", label: "تبديل السيارة" },
  { value: "suspend", label: "تعليق للتعثر" },
  { value: "close", label: "إغلاق العقد" },
  { value: "return", label: "استرجاع السيارة" },
];

export default function ContractOperationsPanel() {
  const utils = trpc.useUtils();
  const [contractNumber, setContractNumber] = useState("");
  const [operation, setOperation] = useState<Operation>("payment");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "network">("cash");
  const [extensionDays, setExtensionDays] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [details, setDetails] = useState("");
  const [vehicleMileage, setVehicleMileage] = useState("");
  const vehicles = trpc.vehicles.available.useQuery();
  const contracts = trpc.contracts.list.useQuery();
  const selectedContract = useMemo(() => contracts.data?.find((item) => item.contract.contractNumber === contractNumber.trim())?.contract, [contracts.data, contractNumber]);
  const remaining = selectedContract ? Math.max(0, Number(selectedContract.totalAmount) - Number(selectedContract.paidAmount)) : null;
  const record = trpc.operations.record.useMutation({ onSuccess: async () => { toast.success("تم حفظ العملية وتحديث السجل"); setAmount(""); setExtensionDays(""); setVehicleId(""); setVehicleMileage(""); setDetails(""); await Promise.all([utils.contracts.list.invalidate(), utils.vehicles.available.invalidate(), utils.operations.history.invalidate(), utils.contracts.details.invalidate()]); }, onError: (error) => toast.error(error.message) });
  const submit = () => {
    if (!contractNumber.trim()) return toast.error("أدخل رقم العقد الظاهر أولاً");
    if ((operation === "payment" || operation === "additional_fee") && (!amount || Number(amount) <= 0)) return toast.error(operation === "payment" ? "أدخل مبلغاً صحيحاً" : "أدخل قيمة الرسم الإضافي");
    if (operation === "rate_update" && (!amount || Number(amount) <= 0)) return toast.error("أدخل سعر التأجير الجديد");
    if (operation === "extension" && (!extensionDays || Number(extensionDays) <= 0)) return toast.error("أدخل عدد أيام التمديد");
    if (operation === "vehicle_swap" && !vehicleId) return toast.error("اختر السيارة البديلة");
    if (vehicleMileage && (!Number.isInteger(Number(vehicleMileage)) || Number(vehicleMileage) < 0)) return toast.error("قراءة العداد يجب أن تكون رقماً صحيحاً غير سالب");
    record.mutate({ contractNumber, operation, amount: operation === "payment" || operation === "additional_fee" || operation === "rate_update" ? amount : undefined, paymentMethod: operation === "payment" ? paymentMethod : undefined, extensionDays: operation === "extension" ? Number(extensionDays) : undefined, vehicleId: operation === "vehicle_swap" ? Number(vehicleId) : undefined, vehicleMileage: vehicleMileage ? Number(vehicleMileage) : undefined, details: details.trim() || undefined });
  };
  const Icon = operation === "payment" ? Banknote : operation === "additional_fee" ? Coins : operation === "rate_update" ? WalletCards : operation === "extension" ? TimerReset : operation === "vehicle_swap" ? ArrowLeftRight : operation === "suspend" ? CirclePause : operation === "close" ? CircleStop : RotateCcw;
  const amountLabel = operation === "rate_update" ? "سعر التأجير الجديد" : operation === "additional_fee" ? "قيمة الرسوم الإضافية" : "المبلغ";

  return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-5 w-5 text-[#139f95]" />تشغيل عقد قائم</CardTitle><p className="text-xs leading-5 text-slate-400">اختر الفرع، ثم أدخل رقم العقد الظاهر. كل عملية تحفظ بتاريخها في سجل العقد.</p></CardHeader><CardContent className="space-y-3"><Input value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} placeholder="رقم العقد الظاهر مثل 1011" inputMode="numeric" className="min-h-12" /><div className="grid grid-cols-3 gap-2" aria-label="الفروع المالية"><Button type="button" variant={operation === "payment" && paymentMethod === "cash" ? "default" : "outline"} className="min-h-11 px-2 text-xs" onClick={() => { setOperation("payment"); setPaymentMethod("cash"); }}>دفعة كاش</Button><Button type="button" variant={operation === "payment" && paymentMethod === "network" ? "default" : "outline"} className="min-h-11 px-2 text-xs" onClick={() => { setOperation("payment"); setPaymentMethod("network"); }}>دفعة شبكة</Button><Button type="button" variant={operation === "additional_fee" ? "default" : "outline"} className="min-h-11 px-2 text-xs" onClick={() => setOperation("additional_fee")}>رسوم إضافية</Button></div>{selectedContract ? <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#effaf8] px-3 py-2 text-xs"><span className="text-slate-500">المتبقي الحالي</span><strong className="text-left text-[#0c8f87]">{remaining?.toFixed(2)} ر.س</strong></div> : contractNumber.trim() && !contracts.isLoading ? <p className="text-xs text-red-600">لم يتم العثور على العقد بهذا الرقم</p> : null}<Input value={vehicleMileage} onChange={(event) => setVehicleMileage(event.target.value)} placeholder="قراءة العداد الحالية (اختياري)" aria-label="قراءة العداد الحالية" inputMode="numeric" min="0" className="min-h-12" /><select value={operation} onChange={(event) => setOperation(event.target.value as Operation)} aria-label="نوع العملية" className="h-12 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#16b4a5]">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{(operation === "payment" || operation === "additional_fee" || operation === "rate_update") && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={amountLabel} aria-label={amountLabel} inputMode="decimal" className="min-h-12" />{operation === "payment" && <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "cash" | "network")} aria-label="طريقة الدفع" className="h-12 rounded-md border border-input bg-background px-3 text-sm"><option value="cash">كاش</option><option value="network">شبكة</option></select>}</div>}{operation === "extension" && <Input value={extensionDays} onChange={(event) => setExtensionDays(event.target.value)} placeholder="عدد أيام التمديد" inputMode="numeric" className="min-h-12" />}{operation === "vehicle_swap" && <div className="flex items-center gap-2"><CarFront className="h-5 w-5 shrink-0 text-[#139f95]" /><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} aria-label="السيارة البديلة" className="h-12 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"><option value="">اختر السيارة البديلة المتاحة</option>{vehicles.data?.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} — {vehicle.plateNumber}</option>)}</select></div>}<Textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="ملاحظات العملية (اختياري)" aria-label="ملاحظات العملية" className="min-h-24 resize-y" /><Button onClick={submit} disabled={record.isPending} className="min-h-12 w-full bg-[#139f95] font-bold hover:bg-[#0d938b]">{record.isPending ? "جارٍ حفظ العملية..." : "حفظ العملية المؤرخة"}</Button></CardContent></Card>;
}
