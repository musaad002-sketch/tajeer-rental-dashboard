import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Ban, Search } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function BlockedCustomersPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const blocked = trpc.blockedCustomers.list.useQuery();
  const rows = blocked.data?.filter((row) => !query.trim() || `${row.fullName} ${row.identityNumber ?? ""} ${row.phone ?? ""} ${row.reason ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  return <div dir="rtl" className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" aria-label="العودة للرئيسية" onClick={() => setLocation("/")}><ArrowRight className="h-5 w-5" /></Button><div><p className="mb-1 text-xs font-bold text-red-600">إدارة المخاطر</p><h1 className="text-3xl font-black tracking-tight">العملاء المحظورون</h1><p className="mt-1 text-sm text-slate-500">لا يُسمح ببدء عقد جديد للعميل قبل مراجعة الإدارة.</p></div></div><Badge className="bg-red-50 text-red-700 hover:bg-red-50"><Ban className="ml-1 h-3.5 w-3.5" />{rows.length} سجل</Badge></div>
    <Card className="border-0 shadow-sm"><CardContent className="p-4"><div className="relative"><Search className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الهوية أو الجوال أو السبب" className="h-11 w-full rounded-md border border-input bg-background pr-10 pl-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-red-300" /></div></CardContent></Card>
    <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="text-base">سجل الحظر المستورد من ملاحظات العملاء</CardTitle></CardHeader><CardContent>{blocked.isLoading ? <p className="py-10 text-center text-sm text-slate-500">جارٍ تحميل القائمة...</p> : rows.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">لا توجد سجلات مطابقة.</p> : <div className="space-y-3">{rows.map((row) => <div key={row.id} className="rounded-xl border border-red-100 bg-red-50/40 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-slate-800">{row.fullName}</p><p className="mt-1 text-xs text-slate-500">الهوية: {row.identityNumber || "غير مسجلة"} · الجوال: {row.phone || "غير مسجل"}</p></div><Badge className="bg-red-100 text-red-700 hover:bg-red-100">محظور</Badge></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-slate-400">الجنسية: </span>{row.nationality || "غير محددة"}</p><p><span className="text-slate-400">المصدر: </span>{row.source || "ملف ملاحظات العملاء"}</p><p className="sm:col-span-2"><span className="text-slate-400">السبب/الملاحظة: </span>{row.reason || "تحتاج مراجعة الإدارة"}</p></div></div>)}</div>}</CardContent></Card>
  </div>;
}
