import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Bell, CarFront, ChevronLeft, ClipboardList, FileBarChart, FileCheck2, History, LayoutDashboard, LogIn, LogOut, Menu, ShieldCheck, Users, WalletCards, Wrench, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const items = [
  { label: "الرئيسية", icon: LayoutDashboard, path: "/" },
  { label: "العقود السارية", icon: FileCheck2, path: "/contracts/active" },
  { label: "العقود المتأخرة", icon: History, path: "/contracts/overdue" },
  { label: "العقود المعلقة", icon: ClipboardList, path: "/contracts/suspended" },
  { label: "سجل العمليات", icon: History, path: "/contracts/history" },
  { label: "السيارات", icon: CarFront, path: "/vehicles" },
  { label: "العملاء", icon: Users, path: "/customers" },
  { label: "الحسابات والإيرادات", icon: WalletCards, path: "/accounting" },
  { label: "سجل المدفوعات", icon: WalletCards, path: "/payments" },
  { label: "سجل الاسترجاعات", icon: History, path: "/returns" },
  { label: "الصيانة والتالف", icon: Wrench, path: "/maintenance" },
  { label: "التقارير", icon: FileBarChart, path: "/reports" },
];

const focusClass = "focus-visible:ring-2 focus-visible:ring-[#16b4a5] focus-visible:ring-offset-2";

export function shouldUseLocalAuth(hostname: string, envEnabled: boolean) {
  return envEnabled || hostname === "localhost" || hostname === "127.0.0.1";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { data: alerts } = trpc.alerts.useQuery(undefined, { enabled: Boolean(user) });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const localAuthEnabled = shouldUseLocalAuth(window.location.hostname, import.meta.env.VITE_LOCAL_AUTH_ENABLED === "true");
  const localLogin = trpc.auth.localLogin.useMutation({ onSuccess: () => window.location.reload(), onError: (error) => toast.error(error.message) });
  const active = items.find((item) => item.path === location)?.label ?? "الرئيسية";

  if (!user) return <div dir="rtl" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef4f7] p-4 sm:p-6"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(19,169,159,0.14),transparent_32%),radial-gradient(circle_at_85%_80%,rgba(11,39,71,0.12),transparent_36%)]" /><div className="relative grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_24px_70px_rgba(11,39,71,0.16)] lg:grid-cols-[1.05fr_0.95fr]"><section aria-label="نبذة عن تأجيرك" className="hidden min-h-[560px] flex-col justify-between bg-[#0b2747] p-10 text-white lg:flex"><div><div className="flex items-center gap-2 text-2xl font-black tracking-tight"><CarFront aria-hidden="true" className="h-7 w-7 text-[#16b4a5]" /><span>تأجيرك</span></div><p className="mt-2 max-w-xs text-sm leading-7 text-slate-300">منصة تشغيل عربية تساعدك على متابعة العقود والسيارات والمدفوعات من مكان واحد.</p></div><div><div className="mb-6 flex items-center gap-3"><span className="h-2.5 w-2.5 rounded-full bg-[#16b4a5] shadow-[0_0_0_6px_rgba(22,180,165,0.12)]" /><span className="text-sm font-semibold text-[#9de6df]">تشغيل محلي سريع وموثوق</span></div><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-2xl font-black text-white">6–5</p><p className="mt-1 text-xs text-slate-300">دورة التشغيل الشهرية</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-2xl font-black text-white">RTL</p><p className="mt-1 text-xs text-slate-300">واجهة عربية بالكامل</p></div></div></div></section><section className="flex min-h-[560px] items-center justify-center p-6 sm:p-10"><div className="w-full max-w-sm"><div className="mb-8 text-center lg:text-right"><div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0b2747] text-[#16b4a5] shadow-lg lg:mx-0"><CarFront aria-hidden="true" className="h-8 w-8" /></div><h1 className="text-3xl font-black tracking-tight text-[#172235]">مرحباً بك في تأجيرك</h1><p className="mt-3 text-sm leading-7 text-slate-500">سجّل الدخول لمتابعة التشغيل اليومي وإدارة عقود مكتبك.</p></div>{localAuthEnabled ? <form onSubmit={(event) => { event.preventDefault(); localLogin.mutate({ username, password }); }} className="space-y-4"><label className="block text-sm font-semibold text-slate-700">اسم المستخدم<Input aria-label="اسم المستخدم" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="اكتب اسم المستخدم" autoComplete="username" className={`mt-1 min-h-12 ${focusClass}`} /></label><label className="block text-sm font-semibold text-slate-700">كلمة المرور<Input aria-label="كلمة المرور" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="اكتب كلمة المرور" type="password" autoComplete="current-password" className={`mt-1 min-h-12 ${focusClass}`} /></label><Button type="submit" disabled={localLogin.isPending} className={`min-h-12 w-full bg-[#13a99f] text-base font-bold hover:bg-[#0d938b] ${focusClass}`}>{localLogin.isPending ? "جارٍ التحقق…" : "دخول محلي"}</Button><p className="text-center text-xs text-slate-400">استخدم بيانات المدير التي أعددتها أثناء تثبيت الخادم المحلي.</p></form> : <Button type="button" onClick={() => startLogin()} className={`min-h-12 w-full bg-[#13a99f] text-base font-bold hover:bg-[#0d938b] ${focusClass}`}>تسجيل الدخول</Button>}</div></section></div></div>;

  return (
    <div dir="rtl" className="min-h-screen bg-[#f5f7fa] text-[#172235]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-[#0b2747] focus:shadow-lg">تجاوز إلى المحتوى</a>
      <aside aria-label="القائمة الرئيسية" className={cn("fixed inset-y-0 right-0 z-50 flex w-[272px] flex-col bg-[#0b2747] text-white shadow-2xl transition-transform duration-200 lg:translate-x-0", open ? "translate-x-0" : "translate-x-full lg:translate-x-0")}>
        <div className="flex h-[92px] items-center justify-between border-b border-white/10 px-7"><div><div className="flex items-center gap-2 text-2xl font-black tracking-tight"><CarFront aria-hidden="true" className="h-7 w-7 text-[#16b4a5]" /><span>تأجيرك</span></div><p className="mt-1 text-[11px] text-slate-300">نظام إدارة التأجير والحسابات</p></div><button type="button" className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-300 hover:bg-white/10 ${focusClass}`} onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X aria-hidden="true" className="h-5 w-5" /></button></div>
        <div className="px-5 pt-6"><p className="mb-3 px-3 text-[10px] font-bold tracking-[0.18em] text-slate-400">التشغيل اليومي</p><nav aria-label="التنقل الرئيسي" className="space-y-1">{items.map((item) => { const Icon = item.icon; const selected = item.path === location || (item.path === "/" && location === "/"); return <button type="button" key={item.path} aria-current={selected ? "page" : undefined} onClick={() => { window.history.pushState({}, "", item.path); window.dispatchEvent(new PopStateEvent("popstate")); setOpen(false); }} className={cn(`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${focusClass}`, selected ? "bg-[#13a99f] text-white shadow-lg shadow-[#13a99f]/20" : "text-slate-300 hover:bg-white/10 hover:text-white")}><Icon aria-hidden="true" className="h-[18px] w-[18px]" /><span>{item.label}</span>{selected && <ChevronLeft aria-hidden="true" className="mr-auto h-4 w-4 opacity-70" />}</button>})}</nav></div>
        <div className="mt-auto border-t border-white/10 p-5"><div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3"><Avatar className="h-9 w-9 border border-white/20"><AvatarFallback className="bg-[#16b4a5] text-white">{user.name?.slice(0, 1) ?? "م"}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-semibold">{user.name ?? "مدير النظام"}</p><p className="truncate text-[11px] text-slate-400">{user.email ?? "حساب الإدارة"}</p></div></div><Button type="button" variant="ghost" onClick={() => logout()} className={`min-h-11 w-full justify-start gap-2 text-slate-300 hover:bg-white/10 hover:text-white ${focusClass}`}><LogOut aria-hidden="true" className="h-4 w-4" /> تسجيل الخروج</Button></div>
      </aside>
      {open && <button type="button" className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق القائمة" />}
      <main id="main-content" className="min-h-screen overflow-x-hidden lg:mr-[272px]"><header aria-label="شريط التطبيق" className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur md:px-8"><div className="flex items-center gap-3"><button type="button" onClick={() => setOpen(true)} className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-slate-500 hover:bg-slate-100 ${focusClass} lg:hidden`} aria-label="فتح القائمة"><Menu aria-hidden="true" className="h-5 w-5" /></button><div><p className="text-[11px] font-semibold text-slate-400">نظام تأجيرك</p><p className="text-sm font-bold text-slate-800">{active}</p></div></div><div className="flex items-center gap-3"><button type="button" onClick={() => alerts?.length ? toast.info(alerts.map((alert) => alert.title).join(" · ")) : toast.success("لا توجد تنبيهات جديدة")} className={`relative flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 ${focusClass}`} aria-label={`الإشعارات${alerts?.length ? `: ${alerts.length} جديدة` : ""}`}><Bell aria-hidden="true" className="h-5 w-5" />{alerts?.length ? <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#e8aa2a] ring-2 ring-white" /> : null}</button><div className="hidden items-center gap-2 border-r border-slate-200 pr-3 sm:flex"><ShieldCheck aria-hidden="true" className="h-4 w-4 text-[#13a99f]" /><span className="text-xs font-medium text-slate-500">{user.role === "admin" ? "مدير النظام" : "مستخدم تشغيلي"}</span></div></div></header><div className="min-w-0 p-4 md:p-7">{children}</div></main>
    </div>
  );
}
