import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";

export default function ForgotPasswordDialog({ focusClass }: { focusClass: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const requestReset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: result => {
      toast.success(result.message);
      setEmail("");
      setOpen(false);
    },
    onError: () => toast.success("إذا كان البريد الإلكتروني مرتبطاً بحساب موثق، فسيصلك رابط استعادة صالح لمدة محدودة."),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    requestReset.mutate({ email });
  };
  return <>
    <Button type="button" variant="link" onClick={() => setOpen(true)} className={`min-h-11 w-full text-[#0b6e69] ${focusClass}`}>
      نسيت كلمة المرور؟
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="text-right">
        <DialogHeader className="text-right">
          <DialogTitle>استعادة كلمة المرور</DialogTitle>
          <DialogDescription>أدخل البريد الإلكتروني الموثق للحساب. ستظهر الرسالة نفسها حتى لا يتم كشف وجود الحساب.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">البريد الإلكتروني<Input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-1 min-h-12" /></label>
          <Button type="submit" disabled={requestReset.isPending} className="min-h-12 w-full bg-[#13a99f] hover:bg-[#0d938b]">{requestReset.isPending ? "جارٍ الإرسال…" : "إرسال رابط الاستعادة"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
