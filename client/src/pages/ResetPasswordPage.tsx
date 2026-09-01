import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const resetPassword = trpc.auth.resetPassword.useMutation({
    onSuccess: () => { toast.success("تم تحديث كلمة المرور"); navigate("/"); },
    onError: (error) => toast.error(error.message),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return toast.error("رابط الاستعادة غير مكتمل");
    if (password.length < 8) return toast.error("كلمة المرور يجب أن تتكون من 8 أحرف على الأقل");
    if (password !== confirmation) return toast.error("تأكيد كلمة المرور غير مطابق");
    resetPassword.mutate({ token, newPassword: password });
  };
  return <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#eef4f7] p-4"><form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-3xl bg-white p-7 shadow-xl"><div><p className="text-sm font-bold text-[#13a99f]">تأجيرك</p><h1 className="mt-2 text-2xl font-black text-[#172235]">استعادة كلمة المرور</h1><p className="mt-2 text-sm leading-6 text-slate-500">أنشئ كلمة مرور جديدة للحساب المرتبط برابط الاستعادة.</p></div><label className="block text-sm font-semibold text-slate-700">كلمة المرور الجديدة<Input type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 min-h-12" /></label><label className="block text-sm font-semibold text-slate-700">تأكيد كلمة المرور<Input type="password" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 min-h-12" /></label><Button disabled={resetPassword.isPending} className="min-h-12 w-full bg-[#13a99f] hover:bg-[#0d938b]">{resetPassword.isPending ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}</Button></form></main>;
}
