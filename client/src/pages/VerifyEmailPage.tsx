import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, CircleAlert, MailCheck } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useMemo } from "react";

export default function VerifyEmailPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const verify = trpc.auth.verifyEmail.useMutation();
  useEffect(() => { if (token) verify.mutate({ token }); }, [token]);
  return <div dir="rtl" className="min-h-screen bg-[#f5f8fb] px-4 py-10"><div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center"><Card className="w-full border-0 shadow-sm"><CardHeader className="text-center"><div className="mx-auto rounded-full bg-[#effaf8] p-4 text-[#139f95]"><MailCheck className="mx-auto h-8 w-8" /></div><CardTitle className="mt-3 text-2xl">توثيق البريد الإلكتروني</CardTitle></CardHeader><CardContent className="space-y-4 text-center">{verify.isPending && <p className="text-sm text-slate-500">جارٍ التحقق من الرابط...</p>}{verify.isSuccess && <div className="space-y-3"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /><p className="font-bold text-emerald-700">تم توثيق البريد بنجاح</p><p className="text-sm text-slate-500">يمكن للمستخدم الآن الدخول من النطاق العام باسم المستخدم وكلمة المرور المحليين.</p><Link href="/"><Button className="bg-[#139f95] hover:bg-[#0d938b]">العودة إلى الدخول</Button></Link></div>}{(verify.isError || !token) && !verify.isPending && !verify.isSuccess && <div className="space-y-3"><CircleAlert className="mx-auto h-10 w-10 text-red-600" /><p className="font-bold text-red-700">رابط التحقق غير صالح أو منتهي</p><p className="text-sm text-slate-500">اطلب من المدير إنشاء رابط تحقق جديد.</p></div>}</CardContent></Card></div></div>;
}

