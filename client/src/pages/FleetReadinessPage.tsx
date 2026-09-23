import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowLeftRight, Ban, CarFront, ChevronLeft, Clock3, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const states = ["all", "returned", "cleaning", "qc", "ready", "blocked"] as const;
type ReadinessState = Exclude<(typeof states)[number], "all">;
const readinessStates: ReadinessState[] = ["returned", "cleaning", "qc", "ready", "blocked"];
const labels: Record<ReadinessState, string> = {
  returned: "مستلمة",
  cleaning: "تنظيف",
  qc: "فحص الجودة",
  ready: "جاهزة",
  blocked: "ممنوعة",
};
const colors: Record<ReadinessState, string> = {
  returned: "border-slate-200 bg-slate-100 text-slate-700",
  cleaning: "border-blue-200 bg-blue-50 text-blue-700",
  qc: "border-violet-200 bg-violet-50 text-violet-700",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  blocked: "border-rose-200 bg-rose-50 text-rose-700",
};
const nextState: Partial<Record<ReadinessState, ReadinessState>> = {
  returned: "cleaning",
  cleaning: "qc",
  qc: "ready",
};

function formatDate(value: Date | string | null | undefined) {
  return value ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "غير مسجل";
}

export default function FleetReadinessPage() {
  const [filter, setFilter] = useState<(typeof states)[number]>("all");
  const [blockedVehicleId, setBlockedVehicleId] = useState<number | null>(null);
  const [blockedReason, setBlockedReason] = useState("");
  const [historyVehicleId, setHistoryVehicleId] = useState<number | null>(null);
  const fleet = trpc.readiness.fleet.useQuery();
  const history = trpc.readiness.history.useQuery({ vehicleId: historyVehicleId ?? 0 }, { enabled: historyVehicleId !== null });
  const utils = trpc.useUtils();
  const update = trpc.readiness.set.useMutation({
    onSuccess: async () => {
      toast.success("تم تحديث جاهزية السيارة");
      setBlockedVehicleId(null);
      setBlockedReason("");
      await Promise.all([utils.readiness.fleet.invalidate(), utils.vehicles.available.invalidate(), utils.vehicles.list.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  const rows = useMemo(() => (fleet.data ?? []).filter(({ readiness }) => filter === "all" || readiness.state === filter), [fleet.data, filter]);
  const counts = useMemo(() => readinessStates.reduce((result, state) => ({ ...result, [state]: (fleet.data ?? []).filter(row => row.readiness.state === state).length }), {} as Record<ReadinessState, number>), [fleet.data]);
  const selectedVehicle = fleet.data?.find(row => row.vehicle.id === historyVehicleId)?.vehicle;
  const blockedVehicle = fleet.data?.find(row => row.vehicle.id === blockedVehicleId)?.vehicle;
  const setState = (vehicleId: number, state: ReadinessState, notes?: string) => update.mutate({ vehicleId, state, notes });

  return <DashboardLayout><div dir="rtl" className="mx-auto max-w-7xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-1 text-xs font-bold text-[#139f95]">تشغيل الأسطول</p><h1 className="text-2xl font-black text-[#172235]">جاهزية الأسطول</h1><p className="mt-2 text-sm text-slate-500">تابع انتقال كل سيارة من الاستلام حتى تصبح جاهزة للتأجير.</p></div><div className="rounded-2xl bg-[#0b2747] p-3 text-[#16b4a5]"><ShieldCheck className="h-7 w-7" /></div></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{readinessStates.map(state => <Card key={state} className="border-0 shadow-sm"><CardContent className="p-4"><p className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${colors[state]}`}>{labels[state]}</p><p className="mt-2 text-2xl font-black text-[#172235]">{counts[state] ?? 0}</p></CardContent></Card>)}</div>
    <Card className="border-0 shadow-sm"><CardContent className="flex gap-2 overflow-x-auto p-3">{states.map(state => <button key={state} type="button" onClick={() => setFilter(state)} className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-bold transition ${filter === state ? "bg-[#139f95] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{state === "all" ? "الكل" : labels[state]}</button>)}</CardContent></Card>
    {fleet.isLoading && <Card><CardContent className="py-12 text-center text-sm text-slate-400">جارٍ تحميل جاهزية الأسطول...</CardContent></Card>}
    {fleet.error && <Card><CardContent className="py-12 text-center text-sm text-red-600">تعذر تحميل الجاهزية: {fleet.error.message}</CardContent></Card>}
    {!fleet.isLoading && !fleet.error && !rows.length && <Card><CardContent className="py-12 text-center text-sm text-slate-400">لا توجد سيارات في هذا التصنيف.</CardContent></Card>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map(({ vehicle, readiness }) => { const state = readiness.state as ReadinessState; const next = nextState[state]; return <Card key={vehicle.id} className="border-0 shadow-sm"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-xl font-black"><CarFront className="h-5 w-5 text-[#139f95]" />{vehicle.plateNumber}</CardTitle><p className="mt-1 text-sm text-slate-500">{vehicle.make} {vehicle.model} · موديل {vehicle.modelYear}</p></div><Badge className={`${colors[state]} border hover:${colors[state]}`}>{labels[state]}</Badge></div></CardHeader><CardContent className="space-y-3"><div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-xs text-slate-500">آخر تحديث</p><p className="mt-1 font-semibold text-slate-700">{formatDate(readiness.changedAt)}</p>{state === "blocked" && <p className="mt-2 font-semibold text-rose-700">السبب: {readiness.blockedReason}</p>}{readiness.notes && <p className="mt-2 text-xs text-slate-500">{readiness.notes}</p>}</div><div className="grid grid-cols-1 gap-2"><Button type="button" disabled={!next || update.isPending} onClick={() => next && setState(vehicle.id, next)} className="min-h-10 gap-2 bg-[#139f95] text-xs font-bold hover:bg-[#0d938b]">{next ? <><ChevronLeft className="h-4 w-4" />نقل للمرحلة التالية: {labels[next]}</> : "جاهزة للتأجير"}</Button><div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" disabled={update.isPending} onClick={() => setBlockedVehicleId(vehicle.id)} className="min-h-10 gap-2 text-xs font-bold text-rose-700"><Ban className="h-4 w-4" />منع</Button><Button type="button" variant="outline" onClick={() => setHistoryVehicleId(vehicle.id)} className="min-h-10 gap-2 text-xs font-bold"><Clock3 className="h-4 w-4" />عرض التاريخ</Button></div></div></CardContent></Card>; })}</div>
    <Dialog open={blockedVehicleId !== null} onOpenChange={open => !open && setBlockedVehicleId(null)}><DialogContent dir="rtl" className="text-right"><DialogHeader className="text-right"><DialogTitle>منع السيارة {blockedVehicle?.plateNumber}</DialogTitle><DialogDescription>أدخل سببًا واضحًا لحفظه في سجل الجاهزية.</DialogDescription></DialogHeader><div className="space-y-3"><Input value={blockedReason} onChange={event => setBlockedReason(event.target.value)} placeholder="سبب المنع" className="min-h-12" /><Button type="button" disabled={update.isPending || blockedReason.trim().length < 2} onClick={() => blockedVehicleId && setState(blockedVehicleId, "blocked", blockedReason.trim())} className="min-h-11 w-full bg-rose-600 font-bold hover:bg-rose-700">حفظ المنع</Button></div></DialogContent></Dialog>
    <Dialog open={historyVehicleId !== null} onOpenChange={open => !open && setHistoryVehicleId(null)}><DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto text-right"><DialogHeader className="text-right"><DialogTitle>تاريخ جاهزية {selectedVehicle?.plateNumber}</DialogTitle><DialogDescription>آخر 10 تغييرات مسجلة على السيارة.</DialogDescription></DialogHeader><div className="space-y-2">{history.isLoading && <p className="py-6 text-center text-sm text-slate-400">جارٍ تحميل التاريخ...</p>}{history.data?.slice(0, 10).map(item => <div key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${colors[item.state as ReadinessState]}`}>{labels[item.state as ReadinessState]}</span><span className="text-xs text-slate-400">{formatDate(item.changedAt)}</span></div>{item.blockedReason && <p className="mt-2 text-sm text-rose-700">{item.blockedReason}</p>}{item.notes && <p className="mt-1 text-xs text-slate-500">{item.notes}</p>}</div>)}{!history.isLoading && !history.data?.length && <p className="py-6 text-center text-sm text-slate-400">لا يوجد تاريخ مسجل، والحالة الافتراضية جاهزة.</p>}</div></DialogContent></Dialog>
  </div></DashboardLayout>;
}
