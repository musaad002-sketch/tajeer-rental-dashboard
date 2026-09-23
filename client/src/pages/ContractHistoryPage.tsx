import {
  formatGregorianDate,
  formatGregorianDateTime,
} from "@shared/dateFormat";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  History,
  Search,
} from "lucide-react";
import AuditReasonDialog from "@/components/AuditReasonDialog";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

const labels: Record<string, string> = {
  new_contract: "عقد جديد",
  extension: "تمديد",
  payment: "دفعة",
  additional_fee: "رسوم إضافية",
  rate_update: "تعديل سعر",
  vehicle_swap: "تبديل سيارة",
  suspend: "تعليق",
  close: "إغلاق",
  return: "استرجاع",
};

export default function ContractHistoryPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const history = trpc.operations.list.useQuery({
    from: from || undefined,
    to: to || undefined,
  });
  const deleteOperation = trpc.operations.deleteSafely.useMutation({
    onSuccess: () => {
      toast.success("تم حذف العملية وحفظ أثرها التدقيقي");
      setDeleteId(null);
      void utils.operations.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const visibleOperations = useMemo(
    () =>
      (history.data ?? []).filter(
        ({ operation, contract, customer, vehicle, operator }) =>
          `${operation.operation} ${operation.details ?? ""} ${contract?.contractNumber ?? ""} ${customer?.fullName ?? ""} ${customer?.identityNumber ?? ""} ${vehicle?.plateNumber ?? ""} ${operator?.name ?? ""}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
      ),
    [history.data, query]
  );
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <p className="mb-1 text-xs font-bold text-[#139f95]">
              التدقيق والمتابعة
            </p>
            <h1 className="text-3xl font-black">سجل العمليات</h1>
            <p className="mt-1 text-sm text-slate-500">
              يعرض جميع عمليات العقود، ويمكن تصفيته بنطاق تاريخ أو البحث في
              بيانات العملية.
            </p>
          </div>
        </div>
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarRange className="h-5 w-5 text-[#139f95]" /> البحث
              والتصفية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="بحث باسم العميل أو اللوحة أو رقم العقد"
                aria-label="بحث في سجل العمليات"
              />
              <Input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                aria-label="التاريخ من"
              />
              <Input
                type="date"
                min={from || undefined}
                value={to}
                onChange={e => setTo(e.target.value)}
                aria-label="التاريخ إلى"
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setFrom("");
                  setTo("");
                }}
                className="gap-2 text-xs"
              >
                <Search className="h-4 w-4" /> مسح الفلاتر
              </Button>
            </div>
            {history.isLoading && (
              <p className="text-xs text-slate-400">
                جارٍ تحميل سجل العمليات...
              </p>
            )}
            {history.error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">
                تعذر تحميل السجل: {history.error.message}
              </p>
            )}
            {!history.isLoading &&
              !history.error &&
              !visibleOperations.length && (
                <p className="py-8 text-center text-sm text-slate-400">
                  لا توجد عمليات مطابقة للفلاتر المحددة.
                </p>
              )}
            <div className="space-y-2">
              {visibleOperations.map(
                ({ operation, contract, customer, vehicle, operator }) => (
                  <div
                    key={operation.id}
                    className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-700">
                          {labels[operation.operation] ?? operation.operation}{" "}
                          {contract?.contractNumber
                            ? `— عقد #${contract.contractNumber}`
                            : ""}
                        </p>
                        <p className="mt-1 text-slate-500">
                          {customer?.fullName ?? "عميل غير محدد"} ·{" "}
                          {vehicle?.plateNumber ?? "بدون سيارة"}
                        </p>
                        <p className="mt-1 text-slate-400">
                          {formatGregorianDateTime(operation.createdAt)} ·
                          المنفذ:{" "}
                          {operator?.name ??
                            (operation.createdBy
                              ? `مستخدم #${operation.createdBy}`
                              : "غير محدد")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#d99c1d]">
                          {operation.amount} ر.س
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() =>
                            setExpandedId(
                              expandedId === operation.id ? null : operation.id
                            )
                          }
                        >
                          {expandedId === operation.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}{" "}
                          التفاصيل
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600"
                          onClick={() => setDeleteId(operation.id)}
                        >
                          حذف
                        </Button>
                      </div>
                    </div>
                    {expandedId === operation.id && (
                      <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 text-slate-600 sm:grid-cols-2">
                        <p>
                          <span className="font-semibold">نتيجة العملية:</span>{" "}
                          {operation.details ?? "بدون ملاحظات مسجلة"}
                        </p>
                        <p>
                          <span className="font-semibold">
                            المركبة المرتبطة:
                          </span>{" "}
                          {vehicle?.plateNumber ?? "غير محددة"}
                        </p>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
        {deleteId !== null && (
          <AuditReasonDialog
            title="حذف العملية"
            description="سيُحفظ snapshot للعملية في سجل التدقيق. اكتب سبب الحذف الإلزامي."
            pending={deleteOperation.isPending}
            onClose={() => setDeleteId(null)}
            onConfirm={reason =>
              deleteOperation.mutate({ id: deleteId, reason })
            }
          />
        )}
      </div>
    </DashboardLayout>
  );
}
