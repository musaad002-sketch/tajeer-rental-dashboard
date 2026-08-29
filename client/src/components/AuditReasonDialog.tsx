import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function AuditReasonDialog({ title, description, onConfirm, onClose, pending = false }: { title: string; description: string; onConfirm: (reason: string) => void; onClose: () => void; pending?: boolean }) {
  const [reason, setReason] = useState("");
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label={title}><Card className="w-full max-w-md border-0 shadow-2xl"><CardHeader><CardTitle className="text-base">{title}</CardTitle><p className="text-xs leading-5 text-slate-500">{description}</p></CardHeader><CardContent className="space-y-3"><Input autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="اكتب السبب الإلزامي" aria-label="سبب العملية" /><div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>إلغاء</Button><Button disabled={pending || reason.trim().length < 2} className="flex-1 bg-[#139f95] hover:bg-[#0d938b]" onClick={() => onConfirm(reason.trim())}>{pending ? "جارٍ الحفظ..." : "تأكيد"}</Button></div></CardContent></Card></div>;
}
