import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Eye, Link2, RotateCcw, Save, Type } from "lucide-react";
import { canPerform } from "@shared/permissions";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const editableItems = [
  { key: "brand.name", type: "text" as const, label: "اسم النظام", original: "مكتب مشاري لتأجير السيارات" },
  { key: "brand.description", type: "text" as const, label: "وصف النظام", original: "نظام إدارة العقود والحسابات" },
  { key: "navigation.reports", type: "text" as const, label: "اسم التقارير", original: "التقارير" },
  { key: "navigation.vehicles", type: "text" as const, label: "اسم السيارات", original: "السيارات" },
  { key: "navigation.customers", type: "text" as const, label: "اسم العملاء", original: "العملاء" },
  { key: "help.url", type: "link" as const, label: "رابط المساعدة", original: "https://example.com" },
];

export default function VisualEditorPage() {
  const { user } = useAuth();
  const canView = canPerform(user?.role ?? "user", user?.permissions, "site_content.view");
  const canEdit = canPerform(user?.role ?? "user", user?.permissions, "site_content.edit");
  const { data, isLoading } = trpc.siteContent.list.useQuery(undefined, { enabled: Boolean(user && canView) });
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const save = trpc.siteContent.save.useMutation({ onSuccess: async () => { toast.success("تم حفظ التعديل"); await utils.siteContent.list.invalidate(); }, onError: (error) => toast.error(error.message) });
  const reset = trpc.siteContent.reset.useMutation({ onSuccess: async () => { toast.success("تمت استعادة القيمة الأصلية"); await utils.siteContent.list.invalidate(); }, onError: (error) => toast.error(error.message) });
  const values = useMemo(() => Object.fromEntries(editableItems.map((item) => [item.key, data?.find((entry) => entry.contentKey === item.key)?.value ?? item.original])), [data]);
  if (!canView) return <DashboardLayout><Card><CardContent className="p-8 text-center text-slate-500">محرر الواجهة متاح للمدير فقط.</CardContent></Card></DashboardLayout>;
  return <DashboardLayout><div className="mx-auto max-w-4xl space-y-5" dir="rtl"><div><p className="text-sm font-bold text-[#139f95]">تخصيص مباشر</p><h1 className="mt-1 text-3xl font-black text-[#172235]">محرر الكتابات والروابط</h1><p className="mt-2 text-sm leading-6 text-slate-500">عدّل النص أو الرابط ثم احفظه ليظهر في الواجهة. لا تحتاج إلى فتح ملفات الكود.</p></div><Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Eye className="h-5 w-5 text-[#139f95]" />العناصر القابلة للتعديل</CardTitle></CardHeader><CardContent className="space-y-4">{isLoading ? <p className="text-sm text-slate-400">جارٍ تحميل العناصر...</p> : editableItems.map((item) => { const value = drafts[item.key] ?? values[item.key] ?? ""; return <div key={item.key} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"><div className="mb-2 flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-bold text-slate-700">{item.type === "link" ? <Link2 className="h-4 w-4 text-[#139f95]" /> : <Type className="h-4 w-4 text-[#139f95]" />}{item.label}</label><code className="text-[10px] text-slate-400">{item.key}</code></div>{item.type === "link" ? <Input dir="ltr" value={value} onChange={(event) => setDrafts({ ...drafts, [item.key]: event.target.value })} placeholder={item.original} /> : <Textarea value={value} onChange={(event) => setDrafts({ ...drafts, [item.key]: event.target.value })} rows={2} /> }<div className="mt-3 flex flex-wrap gap-2">{canEdit && <Button type="button" disabled={save.isPending} onClick={() => save.mutate({ contentKey: item.key, contentType: item.type, value, originalValue: item.original })} className="gap-2 bg-[#139f95] hover:bg-[#0d938b]"><Save className="h-4 w-4" />حفظ</Button>}{canEdit && <Button type="button" variant="outline" disabled={reset.isPending} onClick={() => { reset.mutate({ contentKey: item.key }); setDrafts({ ...drafts, [item.key]: item.original }); }} className="gap-2"><RotateCcw className="h-4 w-4" />استعادة الأصل</Button>}</div></div>})}</CardContent></Card></div></DashboardLayout>;
}
