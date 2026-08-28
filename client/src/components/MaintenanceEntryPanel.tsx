import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);

export default function MaintenanceEntryPanel({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: vehicles, isLoading } = trpc.vehicles.list.useQuery();
  const [values, setValues] = useState({ vehicleId: "", serviceType: "maintenance" as "maintenance" | "oil_change", issueType: "", mileage: "", startDate: today(), status: "pending" as "pending" | "in_progress", cost: "", notes: "" });
  const create = trpc.maintenance.create.useMutation({
    onSuccess: async () => {
      toast.success(values.serviceType === "oil_change" ? "تم تسجيل تغيير الزيت وتحديث العداد والتاريخ في ملف السيارة" : "تم تسجيل الصيانة ووضع السيارة تحت الصيانة");
      await Promise.all([utils.maintenance.list.invalidate(), utils.vehicles.list.invalidate(), utils.dashboard.invalidate(), utils.alerts.invalidate()]);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });
  const eligibleVehicles = vehicles?.filter((vehicle) => !["rented", "reserved", "unavailable"].includes(vehicle.status)) ?? [];
  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const submit = () => {
    if (!values.vehicleId || !values.issueType.trim() || !values.startDate) return toast.error("اختر السيارة واكتب وصف الصيانة وتاريخ البداية");
    if (values.cost && (!Number.isFinite(Number(values.cost)) || Number(values.cost) < 0)) return toast.error("تكلفة الصيانة يجب أن تكون مبلغاً صحيحاً");
    if (values.mileage && (!Number.isInteger(Number(values.mileage)) || Number(values.mileage) < 0)) return toast.error("قراءة العداد يجب أن تكون رقماً صحيحاً غير سالب");
    create.mutate({ vehicleId: Number(values.vehicleId), serviceType: values.serviceType, issueType: values.issueType.trim(), mileage: values.mileage ? Number(values.mileage) : undefined, startDate: values.startDate, status: values.serviceType === "maintenance" ? values.status : undefined, cost: values.cost || "0", notes: values.notes.trim() || undefined });
  };

  return (
    <Card className="border-[#b9e8e3] bg-[#f3fcfa] shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div><CardTitle className="text-base">تسجيل صيانة جديدة</CardTitle><p className="mt-1 text-xs text-slate-500">تتحول السيارة تلقائياً إلى حالة صيانة ولا تظهر ضمن السيارات المتاحة للتأجير.</p></div>
        <Button variant="ghost" size="sm" onClick={onClose}>إلغاء</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">السيارة
            <select value={values.vehicleId} onChange={(event) => set("vehicleId", event.target.value)} disabled={isLoading || create.isPending} className="mt-1 min-h-11 w-full rounded-md border border-input bg-white px-3 text-sm">
              <option value="">{isLoading ? "جارٍ تحميل السيارات..." : "اختر السيارة"}</option>
              {eligibleVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber} — {vehicle.make} {vehicle.model}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">نوع السجل
            <select value={values.serviceType} onChange={(event) => set("serviceType", event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-input bg-white px-3 text-sm">
              <option value="maintenance">صيانة أو عطل</option>
              <option value="oil_change">تغيير زيت</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">وصف العطل أو الصيانة
            <Input value={values.issueType} onChange={(event) => set("issueType", event.target.value)} placeholder={values.serviceType === "oil_change" ? "مثال: تغيير زيت وفلتر" : "مثال: فحص الفرامل"} className="mt-1 min-h-11 bg-white" />
          </label>
          <label className="text-xs font-semibold text-slate-600">تاريخ بداية الصيانة
            <Input type="date" value={values.startDate} onChange={(event) => set("startDate", event.target.value)} className="mt-1 min-h-11 bg-white" />
          </label>
          <label className="text-xs font-semibold text-slate-600">قراءة العداد وقت الخدمة
            <Input value={values.mileage} onChange={(event) => set("mileage", event.target.value)} inputMode="numeric" placeholder="تُحفظ في ملف السيارة" className="mt-1 min-h-11 bg-white" />
          </label>
          <label className="text-xs font-semibold text-slate-600">التكلفة (ر.س)
            <Input value={values.cost} onChange={(event) => set("cost", event.target.value)} inputMode="decimal" placeholder="0.00" className="mt-1 min-h-11 bg-white" />
          </label>
          {values.serviceType === "maintenance" && <label className="text-xs font-semibold text-slate-600">حالة الصيانة
            <select value={values.status} onChange={(event) => set("status", event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-input bg-white px-3 text-sm">
              <option value="pending">بانتظار التنفيذ</option>
              <option value="in_progress">قيد التنفيذ</option>
            </select>
          </label>}
        </div>
        {values.serviceType === "oil_change" && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">يحفظ هذا السجل كمكتمل ويحدّث تلقائياً العداد عند تغيير الزيت وتاريخه في ملف السيارة.</p>}
        <label className="block text-xs font-semibold text-slate-600">ملاحظات الصيانة
          <Textarea value={values.notes} onChange={(event) => set("notes", event.target.value)} placeholder="تفاصيل إضافية عن العطل أو الورشة أو القطع المستخدمة (اختياري)" className="mt-1 min-h-20 resize-y bg-white" />
        </label>
        {!isLoading && eligibleVehicles.length === 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">لا توجد سيارة متاحة لتسجيل صيانة جديدة. السيارات المؤجرة لا يمكن تحويلها إلى صيانة قبل إنهاء أو تبديل العقد.</p>}
        <Button onClick={submit} disabled={create.isPending || isLoading || eligibleVehicles.length === 0} className="min-h-11 bg-[#13a99f] hover:bg-[#0d938b]">{create.isPending ? "جارٍ الحفظ..." : values.serviceType === "oil_change" ? "حفظ تغيير الزيت وتحديث السيارة" : "حفظ سجل الصيانة"}</Button>
      </CardContent>
    </Card>
  );
}
