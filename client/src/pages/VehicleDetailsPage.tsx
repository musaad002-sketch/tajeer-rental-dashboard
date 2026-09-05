import { formatGregorianDate, formatGregorianDateTime } from "@shared/dateFormat";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { calculateOilMaintenance } from "@shared/vehicleMaintenance";
import { canPerform } from "@shared/permissions";
import { ArrowRight, CarFront, ClipboardList, FileCheck, Gauge, History, Trash2, Wrench } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

const statusLabels: Record<string, string> = {
  available: "متاحة",
  reserved: "محجوزة",
  rented: "مؤجرة",
  maintenance: "صيانة",
  unavailable: "غير متاحة",
};

const contractStatusLabels: Record<string, string> = {
  active: "ساري",
  overdue: "متأخر",
  suspended: "معلق",
  closed: "مغلق",
  returned: "مسترجع",
};

const operationLabels: Record<string, string> = {
  new_contract: "فتح عقد",
  extension: "تمديد",
  payment: "دفعة",
  additional_fee: "رسوم إضافية",
  rate_update: "تعديل سعر",
  vehicle_swap: "تبديل سيارة",
  suspend: "تعليق",
  close: "إغلاق",
  return: "استرجاع",
};

function date(value: Date | string | null | undefined) {
  return value ? formatGregorianDate(value) : "غير مسجل";
}

export default function VehicleDetailsPage() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const id = Number(location.split("/").filter(Boolean).pop());
  const details = trpc.vehicles.details.useQuery({ id }, { enabled: Number.isInteger(id) && id > 0 });
  const row = details.data;
  const currentContract = row?.contracts.find(({ contract }) => ["active", "overdue"].includes(contract.status));
  const oilMaintenance = row ? calculateOilMaintenance({ currentMileage: row.vehicle.mileage, lastOilChangeMileage: row.vehicle.lastOilChangeMileage, oilChangeInterval: row.vehicle.oilChangeInterval }) : null;
  const canCreateContract = canPerform(user?.role ?? "user", user?.permissions, "contracts.create");
  const canMaintainVehicle = canPerform(user?.role ?? "user", user?.permissions, "vehicles.maintenance");
  const canDeleteVehicle = canPerform(user?.role ?? "user", user?.permissions, "vehicles.delete");

  return (
    <DashboardLayout>
      <div dir="rtl" className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="العودة إلى السيارات" onClick={() => setLocation("/vehicles")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <p className="mb-1 text-xs font-bold text-[#139f95]">وحدة الأسطول</p>
            <h1 className="text-2xl font-black">تفاصيل السيارة {row?.vehicle.plateNumber ? `— ${row.vehicle.plateNumber}` : ""}</h1>
            <p className="mt-1 text-sm text-slate-500">بيانات السيارة والعداد والوثائق والعقود والعمليات المرتبطة بها.</p>
          </div>
        </div>

        {details.isLoading && <Card><CardContent className="py-12 text-center text-sm text-slate-400">جارٍ تحميل بيانات السيارة...</CardContent></Card>}
        {details.error && <Card><CardContent className="py-12 text-center text-sm text-red-600">تعذر تحميل السيارة: {details.error.message}</CardContent></Card>}
        {!details.isLoading && !details.error && !row && <Card><CardContent className="py-12 text-center text-sm text-slate-400">لم يتم العثور على السيارة.</CardContent></Card>}

        {row && (
          <>
            <Card className="border-0 bg-[#0b2747] text-white shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-3"><CarFront className="h-7 w-7 text-[#16b4a5]" /></div>
                  <div>
                    <h2 className="text-xl font-black">{row.vehicle.make} {row.vehicle.model}</h2>
                    <p className="mt-1 text-sm text-slate-300">لوحة {row.vehicle.plateNumber} · موديل {row.vehicle.modelYear}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3"><Badge className="bg-white/10 text-white hover:bg-white/10">{statusLabels[row.vehicle.status] ?? row.vehicle.status}</Badge>{row.vehicle.status === "available" && canCreateContract && <Link href={`/contracts/new?vehicleId=${row.vehicle.id}`} className="inline-flex min-h-10 items-center rounded-lg bg-[#14a99f] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#11978e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16b4a5]">فتح عقد جديد</Link>}</div>
              </CardContent>
            </Card>

            {canMaintainVehicle && <VehicleEditor vehicle={row.vehicle} />}
            {canDeleteVehicle && <VehicleDeleteAction vehicleId={row.vehicle.id} plateNumber={row.vehicle.plateNumber} onDeleted={() => setLocation("/vehicles")} />}

            {currentContract && (
              <Card className="border-0 bg-[#effaf8] shadow-sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-xs font-bold text-[#0c8f87]">العقد الحالي والعميل الحالي</p>
                    <p className="mt-1 text-sm font-black text-slate-700">{currentContract.customer?.fullName ?? "عميل غير متاح"} · العقد #{currentContract.contract.contractNumber}</p>
                  </div>
                  <Link href={`/contracts/${currentContract.contract.id}`} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#0c8f87] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16b4a5]">فتح العقد</Link>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Info icon={Gauge} label="العداد الحالي" value={`${row.vehicle.mileage.toLocaleString()} كم`} />
              <Info icon={Wrench} label="عداد آخر تغيير زيت" value={row.vehicle.lastOilChangeMileage != null ? `${row.vehicle.lastOilChangeMileage.toLocaleString()} كم` : "غير مسجل"} />
              <Info icon={History} label="تاريخ آخر تغيير زيت" value={date(row.vehicle.lastOilChangeDate)} />
              <Info icon={Wrench} label="المتبقي للصيانة القادمة" value={oilMaintenance?.remaining == null ? "غير محدد" : oilMaintenance.due ? "مستحق الآن" : `${oilMaintenance.remaining.toLocaleString()} كم`} />
              <Info icon={ClipboardList} label="عدد العقود" value={String(row.contracts.length)} />
              <Info icon={FileCheck} label="انتهاء التأمين" value={date(row.vehicle.insuranceExpiryDate)} />
              <Info icon={FileCheck} label="انتهاء الفحص الدوري" value={date(row.vehicle.inspectionExpiryDate)} />
              <Info icon={FileCheck} label="انتهاء الاستمارة" value={date(row.vehicle.registrationExpiryDate)} />
            </div>

            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle>العقود التاريخية للسيارة ({row.contracts.length})</CardTitle></CardHeader>
              <CardContent>
                {row.contracts.length ? (
                  <div className="space-y-2">
                    {row.contracts.map(({ contract, customer }) => (
                      <Link key={contract.id} href={`/contracts/${contract.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 text-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16b4a5]">
                        <div>
                          <p className="font-bold text-[#0c8f87]">العقد #{contract.contractNumber}</p>
                          <p className="mt-1 text-xs text-slate-500">{customer?.fullName ?? "عميل غير متاح"} · من {date(contract.startDate)} إلى {date(contract.expectedReturnDate)}</p>
                        </div>
                        <div className="text-left">
                          <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{contractStatusLabels[contract.status] ?? contract.status}</Badge>
                          <p className="mt-1 text-xs text-slate-500">{contract.totalAmount} ر.س</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : <p className="py-6 text-sm text-slate-400">لا توجد عقود تاريخية لهذه السيارة.</p>}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle>سجل الصيانة وتغيير الزيت ({row.maintenance.length})</CardTitle></CardHeader>
              <CardContent>
                {row.maintenance.length ? (
                  <div className="space-y-2">{row.maintenance.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-3 text-sm last:border-0">
                      <div><p className="font-bold text-slate-700">{item.serviceType === "oil_change" ? "تغيير زيت" : "صيانة"} · {item.issueType}</p><p className="mt-1 text-xs text-slate-400">التاريخ: {date(item.startDate)} · العداد: {item.mileage != null ? `${item.mileage.toLocaleString()} كم` : "غير مسجل"}{item.notes ? ` · ${item.notes}` : ""}</p></div>
                      <div className="text-left"><Badge className={item.status === "completed" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50" : "bg-amber-50 text-amber-700 hover:bg-amber-50"}>{item.status === "completed" ? "مكتمل" : item.status === "in_progress" ? "قيد التنفيذ" : "بانتظار التنفيذ"}</Badge><p className="mt-1 text-xs text-slate-500">{item.cost} ر.س</p></div>
                    </div>
                  ))}</div>
                ) : <p className="py-6 text-sm text-slate-400">لا توجد سجلات صيانة محفوظة.</p>}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle>عمليات السيارة والملاحظات ({row.operations.length})</CardTitle></CardHeader>
              <CardContent>
                {row.operations.length ? (
                  <div className="space-y-2">{row.operations.map((operation) => (
                    <div key={operation.id} className="border-b border-slate-100 py-3 text-sm last:border-0">
                      <p className="font-bold text-slate-700">العقد #{operation.contractId} · {operationLabels[operation.operation] ?? operation.operation}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatGregorianDateTime(operation.createdAt)} · {operation.details ?? "بدون ملاحظات"}</p>
                    </div>
                  ))}</div>
                ) : <p className="py-6 text-sm text-slate-400">لا توجد عمليات مرتبطة بهذه السيارة.</p>}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function VehicleDeleteAction({ vehicleId, plateNumber, onDeleted }: { vehicleId: number; plateNumber: string; onDeleted: () => void }) {
  const utils = trpc.useUtils();
  const remove = trpc.vehicles.delete.useMutation({
    onSuccess: async () => {
      toast.success("تم حذف السيارة التي لا تحتوي على أي سجل تشغيلي");
      await Promise.all([utils.vehicles.list.invalidate(), utils.dashboard.invalidate(), utils.alerts.invalidate()]);
      onDeleted();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Card className="border border-red-100 bg-red-50/60 shadow-sm">
      <CardHeader><CardTitle className="text-base text-red-800">حذف السيارة</CardTitle><p className="text-xs text-red-700">لا يسمح بالحذف إذا كانت السيارة مرتبطة بعقد أو سجل صيانة، حفاظاً على التاريخ المالي والتشغيلي.</p></CardHeader>
      <CardContent>
        <Button variant="destructive" disabled={remove.isPending} className="min-h-11 gap-2" onClick={() => {
          if (window.confirm(`هل تريد حذف السيارة ${plateNumber} نهائياً؟ لا يمكن التراجع عن هذه العملية.`)) remove.mutate({ id: vehicleId });
        }}>
          <Trash2 className="h-4 w-4" />{remove.isPending ? "جارٍ الحذف..." : "حذف السيارة"}
        </Button>
      </CardContent>
    </Card>
  );
}

function VehicleEditor({ vehicle }: { vehicle: { id: number; mileage: number; lastOilChangeMileage: number | null; lastOilChangeDate: Date | string | null; oilChangeInterval: number; insuranceExpiryDate: Date | string | null; inspectionExpiryDate: Date | string | null; registrationExpiryDate: Date | string | null } }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({
    mileage: String(vehicle.mileage ?? 0),
    lastOilChangeMileage: String(vehicle.lastOilChangeMileage ?? ""),
    lastOilChangeDate: toInputDate(vehicle.lastOilChangeDate),
    oilChangeInterval: String(vehicle.oilChangeInterval ?? 5000),
    insuranceExpiryDate: toInputDate(vehicle.insuranceExpiryDate),
    inspectionExpiryDate: toInputDate(vehicle.inspectionExpiryDate),
    registrationExpiryDate: toInputDate(vehicle.registrationExpiryDate),
  });
  const update = trpc.vehicles.update.useMutation({
    onSuccess: async () => {
      toast.success("تم تحديث بيانات السيارة");
      await utils.vehicles.details.invalidate({ id: vehicle.id });
      await utils.vehicles.list.invalidate();
      await utils.dashboard.invalidate();
      await utils.alerts.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const fields = [
    ["mileage", "العداد الحالي", "number"],
    ["lastOilChangeMileage", "العداد عند تغيير الزيت", "number"],
    ["lastOilChangeDate", "تاريخ آخر تغيير زيت", "date"],
    ["oilChangeInterval", "فترة تغيير الزيت (كم)", "number"],
    ["insuranceExpiryDate", "تاريخ تجديد التأمين", "date"], ["inspectionExpiryDate", "تاريخ تجديد الفحص الدوري", "date"], ["registrationExpiryDate", "تاريخ تجديد الاستمارة", "date"],
  ] as const;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="text-base">تحديث بيانات السيارة والوثائق</CardTitle><p className="text-xs leading-6 text-slate-400">حدّث العداد من هنا عند الحاجة، وسجّل تاريخ التجديد الجديد للتأمين أو الفحص الدوري أو الاستمارة ليظهر في ملف السيارة والتنبيهات.</p></CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([key, label, type]) => (
            <label key={key} className="text-xs font-semibold text-slate-600" style={{display: 'none'}}>{label}
              <Input type={type} inputMode={type === "number" ? "numeric" : undefined} min={key === "oilChangeInterval" ? 1 : type === "number" ? 0 : undefined} value={values[key]} onChange={(event: ChangeEvent<HTMLInputElement>) => set(key, event.target.value)} className="mt-1 min-h-11 bg-white" />
            </label>
          ))}
        </div>
        <Button onClick={() => update.mutate({ id: vehicle.id, mileage: Number(values.mileage), lastOilChangeMileage: values.lastOilChangeMileage ? Number(values.lastOilChangeMileage) : undefined, lastOilChangeDate: values.lastOilChangeDate, oilChangeInterval: Number(values.oilChangeInterval || 5000), insuranceExpiryDate: values.insuranceExpiryDate, inspectionExpiryDate: values.inspectionExpiryDate, registrationExpiryDate: values.registrationExpiryDate })} disabled={update.isPending} className="mt-4 min-h-11 bg-[#139f95] hover:bg-[#0d938b]">
          {update.isPending ? "جارٍ الحفظ..." : "حفظ تحديث السيارة"}
        </Button>
      </CardContent>
    </Card>
  );
}

function toInputDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function Info({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return <Card className="border-0 shadow-sm"><CardContent className="p-4"><Icon className="h-5 w-5 text-[#139f95]" /><p className="mt-3 text-xs text-slate-400">{label}</p><p className="mt-1 font-black text-slate-700">{value}</p></CardContent></Card>;
}
