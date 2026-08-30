import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { canAccess } from "@shared/permissions";
import { toast } from "sonner";
import { CarFront, ChevronLeft, ClipboardList, FileBarChart, FileCheck2, History, LayoutDashboard, LogOut, Menu, ShieldCheck, Users, WalletCards, Wrench, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import NotificationCenter from "./NotificationCenter";

const items = [
  { label: "الرئيسية", icon: LayoutDashboard, path: "/", permission: "dashboard" },
  { label: "العقود السارية", icon: FileCheck2, path: "/contracts/active", permission: "contracts" },
  { label: "العقود المتأخرة", icon: History, path: "/contracts/overdue", permission: "contracts" },
  { label: "العقود المعلقة", icon: ClipboardList, path: "/contracts/suspended", permission: "contracts" },
  { label: "سجل العمليات", icon: History, path: "/contracts/history", permission: "operations" },
  { label: "السيارات", icon: CarFront, path: "/vehicles", permission: "vehicles" },
  { label: "العملاء", icon: Users, path: "/customers", permission: "customers" },
  { label: "الحسابات والإيرادات", icon: WalletCards, path: "/accounting", permission: "accounting" },
  { label: "سجل المدفوعات", icon: WalletCards, path: "/payments", permission: "accounting" },
  { label: "سجل الاسترجاعات", icon: History, path: "/returns", permission: "operations" },
  { label: "الصيانة والتالف", icon: Wrench, path: "/maintenance", permission: "maintenance" },
  { label: "التقارير", icon: FileBarChart, path: "/reports", permission: "reports" },
  { label: "إدارة المستخدمين", icon: Users, path: "/users", permission: "user_management" },
] as const;

const focusClass = "focus-visible:ring-2 focus-visible:ring-[#16b4a5] focus-visible:ring-offset-2";
export function shouldUseLocalAuth(hostname: string, envEnabled: boolean) {
  return envEnabled || hostname === "localhost" || hostname === "127.0.0.1";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // تأجيرك يعمل محلياً؛ لذلك يبقى الدخول المحلي هو الافتراضي على localhost والمعاينة والموقع المنشور، ولا يُستخدم Manus للمشغّل.
  const localAuthEnabled = true;
  const { mutate: localLogin, isPending } = trpc.auth.localLogin.useMutation({
    onSuccess: () => window.location.reload(),
    onError: (error) => toast.error(error.message),
  });
  const visibleItems = items.filter((item) => canAccess(user?.role ?? "user", user?.permissions, item.permission));
  const active = items.find((item) => item.path === location)?.label ?? "الرئيسية";

  if (!user) {
    return (
      <div dir="rtl" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef4f7] p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(19,169,159,0.14),transparent_32%),radial-gradient(circle_at_85%_80%,rgba(11,39,71,0.12),transparent_36%)]" />
        <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_24px_70px_rgba(11,39,71,0.16)] lg:grid-cols-[1.05fr_0.95fr]">
          <section aria-label="نبذة عن تأجيرك" className="hidden min-h-[560px] flex-col justify-between bg-[#0b2747] p-10 text-white lg:flex">
            <div><div className="flex items-center gap-2 text-2xl font-black"><CarFront className="h-7 w-7 text-[#16b4a5]" /><span>تأجيرك</span></div><p className="mt-2 max-w-xs text-sm leading-7 text-slate-300">منصة تشغيل عربية تساعدك على متابعة العقود والسيارات والمدفوعات من مكان واحد.</p></div>
            <div className="mb-6 flex items-center gap-3"><span className="h-2.5 w-2.5 rounded-full bg-[#16b4a5]" /><span className="text-sm font-semibold text-[#9de6df]">تشغيل محلي سريع وموثوق</span></div>
          </section>
          <section className="flex min-h-[560px] items-center justify-center p-6 sm:p-10"><div className="w-full max-w-sm"><div className="mb-8 text-center lg:text-right"><div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0b2747] text-[#16b4a5] shadow-lg lg:mx-0"><CarFront className="h-8 w-8" /></div><h1 className="text-3xl font-black tracking-tight text-[#172235]">مرحباً بك في تأجيرك</h1><p className="mt-3 text-sm leading-7 text-slate-500">سجّل الدخول لمتابعة التشغيل اليومي وإدارة عقود مكتبك.</p></div>{localAuthEnabled ? <form onSubmit={(event) => { event.preventDefault(); localLogin({ username, password }); }} className="space-y-4"><label className="block text-sm font-semibold text-slate-700">اسم المستخدم<Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="اكتب اسم المستخدم" autoComplete="username" className={`mt-1 min-h-12 ${focusClass}`} /></label><label className="block text-sm font-semibold text-slate-700">كلمة المرور<Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="اكتب كلمة المرور" type="password" autoComplete="current-password" className={`mt-1 min-h-12 ${focusClass}`} /></label><Button type="submit" disabled={isPending} className={`min-h-12 w-full bg-[#13a99f] text-base font-bold hover:bg-[#0d938b] ${focusClass}`}>{isPending ? "جارٍ التحقق…" : "دخول محلي"}</Button></form> : <Button type="button" onClick={() => startLogin()} className={`min-h-12 w-full bg-[#13a99f] text-base font-bold hover:bg-[#0d938b] ${focusClass}`}>تسجيل الدخول</Button>}</div></section>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#f5f7fa] text-[#172235]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3">تجاوز إلى المحتوى</a>
      <aside aria-label="القائمة الرئيسية" className={cn("fixed inset-y-0 right-0 z-50 flex w-[272px] flex-col bg-[#0b2747] text-white shadow-2xl transition-transform duration-200 lg:translate-x-0", open ? "translate-x-0" : "translate-x-full lg:translate-x-0")}>
        <div className="flex h-[92px] items-center justify-between border-b border-white/10 px-7"><div><div className="flex items-center gap-2 text-2xl font-black"><CarFront className="h-7 w-7 text-[#16b4a5]" /><span>تأجيرك</span></div><p className="mt-1 text-[11px] text-slate-300">نظام إدارة التأجير والحسابات</p></div><button type="button" className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-300 hover:bg-white/10 ${focusClass}`} onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X className="h-5 w-5" /></button></div>
        <div className="px-5 pt-6"><p className="mb-3 px-3 text-[10px] font-bold tracking-[0.18em] text-slate-400">التشغيل اليومي</p><nav aria-label="التنقل الرئيسي" className="space-y-1">{visibleItems.map((item) => { const Icon = item.icon; const selected = item.path === location || (item.path === "/" && location === "/"); return <button type="button" key={item.path} aria-current={selected ? "page" : undefined} onClick={() => { window.history.pushState({}, "", item.path); window.dispatchEvent(new PopStateEvent("popstate")); setOpen(false); }} className={cn(`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${focusClass}`, selected ? "bg-[#13a99f] text-white shadow-lg shadow-[#13a99f]/20" : "text-slate-300 hover:bg-white/10 hover:text-white")}><Icon className="h-[18px] w-[18px]" /><span>{item.label}</span>{selected && <ChevronLeft className="mr-auto h-4 w-4 opacity-70" />}</button>; })}</nav></div>
        <div className="mt-auto border-t border-white/10 p-5"><button type="button" onClick={() => setAccountOpen(true)} className={`mb-3 flex min-h-14 w-full items-center gap-3 rounded-xl bg-white/5 p-3 text-right hover:bg-white/10 ${focusClass}`} aria-label="فتح بيانات الحساب"><Avatar className="h-9 w-9 border border-white/20"><AvatarFallback className="bg-[#16b4a5] text-white">{user.name?.slice(0, 1) ?? "م"}</AvatarFallback></Avatar><span className="min-w-0"><span className="block truncate text-sm font-semibold">{user.name ?? "مدير النظام"}</span><span className="block truncate text-[11px] text-slate-400">{user.email ?? "حساب الإدارة"}</span></span></button><Button type="button" variant="ghost" onClick={() => logout()} className={`min-h-11 w-full justify-start gap-2 text-slate-300 hover:bg-white/10 hover:text-white ${focusClass}`}><LogOut className="h-4 w-4" /> تسجيل الخروج</Button></div>
      </aside>
      {open && <button type="button" className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق القائمة" />}
      <main id="main-content" className="min-h-screen overflow-x-hidden lg:mr-[272px]">
        <header aria-label="شريط التطبيق" className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur md:px-8"><div className="flex items-center gap-3"><button type="button" onClick={() => setOpen(true)} className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-slate-500 hover:bg-slate-100 ${focusClass} lg:hidden`} aria-label="فتح القائمة"><Menu className="h-5 w-5" /></button><div><p className="text-[11px] font-semibold text-slate-400">مؤسسة مشاري السبيعي</p><p className="text-sm font-bold text-slate-800">{active}</p></div></div><div className="flex items-center gap-2"><NotificationCenter /><button type="button" onClick={() => setAccountOpen(true)} className={`hidden min-h-11 items-center gap-2 rounded-xl px-2.5 text-right hover:bg-slate-100 sm:flex ${focusClass}`} aria-label="فتح بيانات الحساب"><Avatar className="h-8 w-8"><AvatarFallback className="bg-[#0b2747] text-xs text-white">{user.name?.slice(0, 1) ?? "م"}</AvatarFallback></Avatar><span><span className="block max-w-28 truncate text-xs font-bold text-slate-700">{user.name ?? "مدير النظام"}</span><span className="block text-[10px] text-slate-400">{user.role === "admin" ? "مدير النظام" : "مستخدم تشغيلي"}</span></span></button><Button type="button" variant="outline" onClick={() => logout()} className={`min-h-11 gap-2 border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 ${focusClass}`} aria-label="تسجيل الخروج"><LogOut className="h-4 w-4 text-[#0b6e69]" /><span className="hidden md:inline">تسجيل الخروج</span></Button></div></header>
        <Dialog open={accountOpen} onOpenChange={setAccountOpen}><DialogContent dir="rtl" className="text-right"><DialogHeader className="text-right"><DialogTitle className="text-xl font-black text-[#172235]">بيانات الحساب</DialogTitle><DialogDescription>معلومات المستخدم الحالي والصلاحيات المرتبطة بحسابه.</DialogDescription></DialogHeader><div className="space-y-3"><div className="rounded-xl bg-[#effaf8] p-4"><p className="text-xs text-slate-500">الاسم</p><p className="mt-1 font-bold text-[#172235]">{user.name ?? "غير مسجل"}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">البريد الإلكتروني</p><p className="mt-1 font-semibold text-slate-800">{user.email ?? "لا يوجد بريد مسجل"}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">الدور</p><p className="mt-1 font-semibold text-slate-800">{user.role === "admin" ? "مدير النظام" : "مستخدم تشغيلي"}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">الصلاحيات</p><p className="mt-1 text-sm leading-6 text-slate-700">{user.role === "admin" ? "كامل وحدات الإدارة والتقارير والمستخدمين." : user.permissions || "الصلاحيات التشغيلية الممنوحة للحساب."}</p></div></div><div className="flex justify-start"><Button type="button" variant="outline" onClick={() => setAccountOpen(false)} className={focusClass}>إغلاق</Button></div></DialogContent></Dialog>
        <div className="min-w-0 p-4 md:p-7" style={{borderRadius: 'px', borderWidth: 'px', fontSize: 'px', height: 'px', marginBottom: 'px', marginLeft: 'px', marginRight: 'px', marginTop: 'px', paddingBottom: 'px', paddingLeft: 'px', paddingRight: 'px', paddingTop: 'px', width: 'px'}}>{children}</div>
      </main>
    </div>
  );
}
