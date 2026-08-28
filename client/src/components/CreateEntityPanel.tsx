import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

export default function CreateEntityPanel({ kind, onClose }: { kind: "vehicle" | "customer"; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState<Record<string, string>>({});
  const vehicleMutation = trpc.vehicles.create.useMutation({ onSuccess: async () => { toast.success("تمت إضافة السيارة وتظهر الآن في الأسطول"); await Promise.all([utils.vehicles.list.invalidate(), utils.vehicles.available.invalidate(), utils.dashboard.invalidate()]); onClose(); }, onError: (e) => toast.error(e.message) });
  const customerMutation = trpc.customers.create.useMutation({ onSuccess: async () => { toast.success("تمت إضافة العميل"); await utils.customers.list.invalidate(); onClose(); }, onError: (e) => toast.error(e.message) });
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const submit = () => {
    if (kind === "customer") {
      if (!values.identityNumber || !values.fullName || !values.phone) return toast.error("يرجى تعبئة رقم الهوية والاسم والجوال");
      customerMutation.mutate({ identityNumber: values.identityNumber, fullName: values.fullName, phone: values.phone, email: values.email || undefined });
    } else {
      if (!values.plateNumber || !values.make || !values.model || !values.modelYear || !values.dailyRate || !values.monthlyRate) return toast.error("يرجى تعبئة بيانات السيارة الأساسية");
      vehicleMutation.mutate({ plateNumber: values.plateNumber, make: values.make, model: values.model, modelYear: Number(values.modelYear), dailyRate: values.dailyRate, monthlyRate: values.monthlyRate, mileage: 0, insuranceExpiryDate: values.insuranceExpiryDate || undefined, inspectionExpiryDate: values.inspectionExpiryDate || undefined, registrationExpiryDate: values.registrationExpiryDate || undefined });
    }
  };
  const fields = kind === "customer" ? [["identityNumber", "رقم الهوية"], ["fullName", "اسم العميل"], ["phone", "رقم الجوال الأساسي (إجباري)"], ["email", "البريد الإلكتروني"]] : [["plateNumber", "رقم اللوحة"], ["make", "الماركة"], ["model", "الموديل"], ["modelYear", "السنة"], ["dailyRate", "الإيجار اليومي"], ["monthlyRate", "الإيجار الشهري"], ["insuranceExpiryDate", "انتهاء التأمين (اختياري)"], ["inspectionExpiryDate", "انتهاء الفحص الدوري (اختياري)"], ["registrationExpiryDate", "انتهاء الاستمارة (اختياري)"]];
  return <Card className="border-[#b9e8e3] bg-[#f3fcfa] shadow-sm"><CardHeader className="flex flex-row items-center justify-between pb-3"><CardTitle className="text-base">{kind === "customer" ? "إضافة عميل جديد" : "إضافة سيارة جديدة"}</CardTitle>{kind === "vehicle" && <p className="mt-1 text-xs leading-5 text-slate-500">تُضاف بيانات العداد وتغيير الزيت لاحقًا من خيار الصيانة، ويمكن تحديث تواريخ الوثائق من تفاصيل السيارة عند التجديد.</p>}<Button variant="ghost" size="sm" onClick={onClose}>إلغاء</Button></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{fields.map(([key, label]) => <label key={key} className="text-xs font-semibold text-slate-600">{label}<Input required={kind === "customer" && key === "phone"} type={kind === "vehicle" && ["lastOilChangeDate", "insuranceExpiryDate", "inspectionExpiryDate", "registrationExpiryDate"].includes(key) ? "date" : kind === "customer" && key === "phone" ? "tel" : "text"} inputMode={kind === "customer" && key === "phone" ? "tel" : undefined} autoComplete={kind === "customer" && key === "phone" ? "tel" : undefined} className="mt-1 bg-white text-sm" value={values[key] ?? ""} onChange={(e) => set(key, e.target.value)} /></label>)}</div><Button className="mt-4 bg-[#13a99f] hover:bg-[#0d938b]" onClick={submit} disabled={vehicleMutation.isPending || customerMutation.isPending}>حفظ البيانات</Button></CardContent></Card>;
}
