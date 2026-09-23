import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";

export default function OperatorExpensePanel() {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [expenseReason, setExpenseReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "network" | "transfer"
  >("cash");
  const create = trpc.liabilities.create.useMutation({
    onSuccess: () => {
      toast.success("تم تسجيل المصروف بانتظار اعتماد المدير");
      setDescription("");
      setAmount("");
      setExpenseDate("");
      setExpenseReason("");
      setPaymentMethod("cash");
    },
    onError: error => toast.error(error.message),
  });
  const submit = () => {
    if (
      !description.trim() ||
      !amount ||
      Number(amount) <= 0 ||
      !expenseDate ||
      !expenseReason.trim()
    )
      return toast.error("أدخل وصف المصروف والمبلغ والتاريخ والسبب");
    create.mutate({
      category: "other",
      description: description.trim(),
      amount,
      expenseDate,
      expenseReason: expenseReason.trim(),
      notes: `مصروف يدوي من المشغّل؛ طريقة الدفع: ${paymentMethod}`,
    });
  };
  return (
    <Card className="border-0 shadow-[0_8px_28px_rgba(22,34,53,0.06)]">
      <CardHeader>
        <div>
          <div>
            <CardTitle className="text-base">تسجيل مصروف يدوي</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              متاح للمشغّل للتسجيل فقط، ولا يؤثر في صافي الإيراد قبل اعتماد
              المدير.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          aria-label="وصف المصروف اليدوي"
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder="وصف المصروف"
        />
        <Input
          aria-label="مبلغ المصروف اليدوي"
          value={amount}
          onChange={event => setAmount(event.target.value)}
          placeholder="المبلغ ر.س"
          inputMode="decimal"
        />
        <Input
          aria-label="تاريخ المصروف اليدوي"
          type="date"
          value={expenseDate}
          onChange={event => setExpenseDate(event.target.value)}
        />
        <Input
          aria-label="سبب المصروف اليدوي"
          value={expenseReason}
          onChange={event => setExpenseReason(event.target.value)}
          placeholder="سبب الصرف"
        />
        <select
          aria-label="طريقة دفع المصروف اليدوي"
          value={paymentMethod}
          onChange={event =>
            setPaymentMethod(event.target.value as typeof paymentMethod)
          }
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="cash">كاش</option>
          <option value="network">شبكة</option>
          <option value="transfer">تحويل</option>
        </select>
        <Button
          type="button"
          onClick={submit}
          disabled={create.isPending}
          className="bg-[#0b2747] hover:bg-[#123a61] sm:col-span-2 lg:col-span-5"
        >
          {create.isPending ? "جارٍ الحفظ…" : "تسجيل المصروف للمراجعة"}
        </Button>
      </CardContent>
    </Card>
  );
}
