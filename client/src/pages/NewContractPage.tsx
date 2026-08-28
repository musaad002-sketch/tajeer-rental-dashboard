import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { calculateContractAmounts, formatMoney } from "@shared/contractCalculation";
import { getPreselectedVehicleId } from "@shared/contractEntry";
import { ArrowRight, CarFront, FilePlus2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type ContractForm = {
  customerId: string;
  type: "daily" | "monthly";
  vehicleId: string;
  startDate: string;
  expectedReturnDate: string;
  notes: string;
  vehicleMileage: string;
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function NewContractPage() {
  const [, setLocation] = useLocation();
  const today = new Date().toISOString().slice(0, 10);
  const preselectedVehicleId = getPreselectedVehicleId(window.location.search);
  const [form, setForm] = useState<ContractForm>(() => ({ customerId: "", vehicleId: preselectedVehicleId, type: "daily", startDate: today, expectedReturnDate: addDays(today, 1), notes: "", vehicleMileage: "" }));
  const [customRate, setCustomRate] = useState("");
  const customers = trpc.customers.list.useQuery(undefined);
  const vehicles = trpc.vehicles.available.useQuery(undefined);
  const create = trpc.contracts.create.useMutation({ onSuccess: () => { toast.success("تم تسجيل التأجير وحجز السيارة"); setLocation("/contracts/active"); }, onError: (error) => toast.error(error.message) });
  const selectedVehicle = useMemo(() => vehicles.data?.find((vehicle) => String(vehicle.id) === form.vehicleId), [vehicles.data, form.vehicleId]);
  const defaultRate = selectedVehicle ? Number(form.type === "monthly" ? selectedVehicle.monthlyRate : selectedVehicle.dailyRate) || 0 : 0;
  const unitRate = customRate.trim() ? Number(customRate) || 0 : defaultRate;
  const amounts = calculateContractAmounts(form.startDate, form.expectedReturnDate, unitRate, 0, form.type);
  const set = <K extends keyof ContractForm>(key: K, value: ContractForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    if (!form.customerId || !form.vehicleId || !form.startDate || !form.expectedReturnDate || !unitRate || !amounts.days || !amounts.total) {
      return toast.error("يرجى تعبئة العميل والسيارة ونوع العقد والتاريخين");
    }
    if (new Date(`${form.expectedReturnDate}T00:00:00`) <= new Date(`${form.startDate}T00:00:00`)) {
      return toast.error("تاريخ التسليم يجب أن يكون بعد تاريخ البداية");
    }
    create.mutate({ customerId: Number(form.customerId), vehicleId: Number(form.vehicleId), vehicleMileage: form.vehicleMileage ? Number(form.vehicleMileage) : undefined, type: form.type, startDate: form.startDate, expectedReturnDate: form.expectedReturnDate, rentalAmount: formatMoney(unitRate), days: amounts.days, totalAmount: amounts.total, paidAmount: "0.00", notes: form.notes.trim() || undefined });
  };

  if (!preselectedVehicleId) return <DashboardLayout><div dir="rtl" className="mx-auto max-w-2xl"><Card className="border-0 shadow-[0_8px_28px_rgba(22,34,53,0.06)]"><CardContent className="space-y-4 p-8 text-center"><CarFront className="mx-auto h-10 w-10 text-[#139f95]" /><h1 className="text-xl font-black text-[#172235]">ابدأ من السيارات المتاحة</h1><p className="text-sm leading-7 text-slate-500">لا يمكن فتح عقد جديد من هذه الصفحة مباشرة. ادخل إلى السيارات المتاحة، اختر السيارة، ثم اضغط «فتح عقد جديد».</p><Button onClick={() => setLocation("/vehicles")} className="min-h-11 bg-[#13a99f] hover:bg-[#0d938b]">الذهاب إلى السيارات المتاحة</Button></CardContent></Card></div></DashboardLayout>;

  return <DashboardLayout><div dir="rtl" className="mx-auto max-w-4xl space-y-5"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" aria-label="العودة إلى السيارات" onClick={() => setLocation("/vehicles")}><ArrowRight className="h-5 w-5" /></Button><div><p className="mb-1 text-xs font-bold text-[#139f95]">وحدة التأجير</p><h1 className="text-2xl font-black tracking-tight">تسجيل تأجير جديد</h1><p className="mt-1 text-sm text-slate-500">اختر العميل والسيارة وحدد تاريخ البداية والتسليم.</p></div></div><Card className="border-0 shadow-[0_8px_28px_rgba(22,34,53,0.06)]"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FilePlus2 className="h-5 w-5 text-[#139f95]" />بيانات التأجير</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Field label="رقم العقد"><div className="flex h-12 items-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">يُولّد تلقائياً عند الحفظ</div></Field><Field label="العميل" required><Select value={form.customerId} onChange={(event) => set("customerId", event.target.value)}><option value="">{customers.isLoading ? "جارٍ تحميل العملاء..." : "اختر العميل"}</option>{customers.data?.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName} — {customer.identityNumber}</option>)}</Select></Field><Field label="نوع العقد" required><Select value={form.type} onChange={(event) => { set("type", event.target.value as ContractForm["type"]); setCustomRate(""); }}><option value="daily">يومي</option><option value="monthly">شهري (30 يوماً)</option></Select></Field><Field label="السيارة المختارة" required helper="تم اختيارها من قائمة السيارات المتاحة ولا يمكن تغييرها هنا"><Select value={form.vehicleId} disabled><option value="">{vehicles.isLoading ? "جارٍ تحميل السيارة..." : selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model} — ${selectedVehicle.plateNumber}` : "السيارة المحددة غير متاحة للتأجير"}</option>{selectedVehicle && <option value={selectedVehicle.id}>{selectedVehicle.make} {selectedVehicle.model} — {selectedVehicle.plateNumber}</option>}</Select></Field><Field label="سعر التأجير" required helper={selectedVehicle ? `الافتراضي ${formatMoney(defaultRate)} ر.س؛ اتركه فارغاً لاعتماد سعر السيارة` : "اختر السيارة أولاً"}><Input type="number" min="0.01" step="0.01" value={customRate} onChange={(event) => setCustomRate(event.target.value)} placeholder={selectedVehicle ? formatMoney(defaultRate) : "سعر التأجير"} inputMode="decimal" /></Field><Field label="العداد عند فتح العقد" helper="اختياري؛ عند إدخاله يصبح العداد الحالي للسيارة ويظهر في السجل"><Input type="number" min="0" step="1" value={form.vehicleMileage} onChange={(event) => set("vehicleMileage", event.target.value)} placeholder={selectedVehicle ? `${selectedVehicle.mileage.toLocaleString()} كم` : "قراءة العداد"} inputMode="numeric" /></Field><Field label="تاريخ البداية" required><Input type="date" value={form.startDate} onChange={(event) => set("startDate", event.target.value)} /></Field><Field label="تاريخ التسليم" required helper="تُعاد حساب المدة والتكلفة فور تغييره"><Input type="date" min={form.startDate} value={form.expectedReturnDate} onChange={(event) => set("expectedReturnDate", event.target.value)} /></Field><Field label="المدة والتكلفة المحسوبة"><div className="grid grid-cols-2 gap-2"><Input value={amounts.days ? `${amounts.days} يوم` : "—"} readOnly className="bg-slate-50 font-bold text-[#139f95]" /><Input value={amounts.total ? `${amounts.total} ر.س` : "—"} readOnly className="bg-slate-50 font-bold text-[#b47c00]" /></div></Field><Field label="ملاحظات العقد"><Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} placeholder="اكتب ملاحظات العقد أو شروطه الخاصة (اختياري)" className="min-h-24 resize-y" /></Field></CardContent></Card>{selectedVehicle && <Card className="border-0 bg-[#0b2747] text-white shadow-sm"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-center gap-3"><CarFront className="h-5 w-5 text-[#16b4a5]" /><div><p className="font-black">{selectedVehicle.make} {selectedVehicle.model}</p><p className="text-xs text-slate-300">{selectedVehicle.plateNumber} · السعر {form.type === "monthly" ? "الشهري" : "اليومي"} {formatMoney(unitRate)} ر.س</p></div></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs">متاح للتأجير</span></CardContent></Card>}<div className="flex flex-wrap gap-3"><Button onClick={submit} disabled={create.isPending} className="min-h-12 bg-[#13a99f] px-7 font-bold hover:bg-[#0d938b]">{create.isPending ? "جارٍ الحفظ..." : "تسجيل التأجير"}</Button><Button variant="outline" onClick={() => setLocation("/vehicles")} className="min-h-12">العودة إلى السيارات</Button></div></div></DashboardLayout>;
}

function Field({ label, required, helper, children }: { label: string; required?: boolean; helper?: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}{required && <span className="mr-1 text-red-500" aria-hidden="true">*</span>}{helper && <span className="mt-1 block text-[11px] font-normal leading-5 text-slate-400">{helper}</span>}<div className="mt-2">{children}</div></label>;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-12 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#16b4a5]">{children}</select>;
}
