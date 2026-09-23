import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  calculateContractAmounts,
  formatMoney,
  monthlyReturnDate,
} from "@shared/contractCalculation";
import {
  calculateOilMaintenance,
  mileageWarningMessage,
} from "@shared/vehicleMaintenance";
import { CarFront, FilePlus2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ContractType = "daily" | "monthly";
type ContractScope = "domestic_limited" | "domestic_open" | "international";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function NewContractInline() {
  const today = new Date().toISOString().slice(0, 10);
  const [vehicleId, setVehicleId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    "existing"
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [newCustomer, setNewCustomer] = useState({
    fullName: "",
    identityNumber: "",
    phone: "",
    phoneSecondary: "",
  });
  const [type, setType] = useState<ContractType>("daily");
  const [contractScope, setContractScope] =
    useState<ContractScope>("domestic_open");
  const [startDate, setStartDate] = useState(today);
  const [expectedReturnDate, setExpectedReturnDate] = useState(
    addDays(today, 1)
  );
  const [rate, setRate] = useState("");
  const [vehicleMileage, setVehicleMileage] = useState("");
  const [cash, setCash] = useState("");
  const [network, setNetwork] = useState("");
  const [additionalFee, setAdditionalFee] = useState("");
  const [notes, setNotes] = useState("");
  const [vehicleNoteResolution, setVehicleNoteResolution] = useState<
    "repaired" | "not_repaired" | "not_needed" | ""
  >("");
  const vehicles = trpc.vehicles.available.useQuery();
  const customers = trpc.customers.list.useQuery();
  const openVehicleNotes = trpc.vehicleNotes.listOpen.useQuery(
    { vehicleId: Number(vehicleId) },
    { enabled: Boolean(vehicleId) }
  );
  const utils = trpc.useUtils();
  const createCustomer = trpc.customers.create.useMutation();
  const createContract = trpc.contracts.create.useMutation();
  const selectedVehicle = useMemo(
    () => vehicles.data?.find(item => String(item.id) === vehicleId),
    [vehicles.data, vehicleId]
  );
  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    return (customers.data ?? []).filter(
      item =>
        !query ||
        [
          item.fullName,
          item.identityNumber,
          item.phone,
          item.phoneSecondary ?? "",
        ].some(value => value.toLowerCase().includes(query))
    );
  }, [customers.data, customerSearch]);
  const defaultRate = selectedVehicle
    ? Number(
        type === "monthly"
          ? selectedVehicle.monthlyRate
          : selectedVehicle.dailyRate
      ) || 0
    : 0;
  const unitRate = Number(rate) > 0 ? Number(rate) : defaultRate;
  useEffect(() => {
    if (type === "monthly") setExpectedReturnDate(monthlyReturnDate(startDate));
  }, [startDate, type]);
  const amounts = calculateContractAmounts(
    startDate,
    expectedReturnDate,
    unitRate,
    Number(additionalFee) || 0,
    type
  );
  const oilStatus = selectedVehicle
    ? calculateOilMaintenance({
        currentMileage: Number(vehicleMileage) || selectedVehicle.mileage,
        lastOilChangeMileage: selectedVehicle.lastOilChangeMileage,
        oilChangeInterval: selectedVehicle.oilChangeInterval,
        lastOilChangeDate: selectedVehicle.lastOilChangeDate,
      })
    : null;
  const oilWarning = oilStatus ? mileageWarningMessage(oilStatus) : null;

  const submit = async () => {
    if (
      !vehicleId ||
      !startDate ||
      !expectedReturnDate ||
      !unitRate ||
      !amounts.days ||
      !amounts.total
    )
      return toast.error("اختر السيارة وأكمل التواريخ والسعر");
    if (
      !vehicleMileage ||
      !Number.isInteger(Number(vehicleMileage)) ||
      Number(vehicleMileage) < 0
    )
      return toast.error("أدخل العداد الحالي للسيارة قبل إنشاء العقد");
    if (
      new Date(`${expectedReturnDate}T00:00:00`) <=
      new Date(`${startDate}T00:00:00`)
    )
      return toast.error("تاريخ التسليم يجب أن يكون بعد تاريخ البداية");
    if (customerMode === "existing" && !customerId)
      return toast.error("اختر العميل");
    if (
      customerMode === "new" &&
      (!newCustomer.fullName.trim() ||
        !newCustomer.identityNumber.trim() ||
        !newCustomer.phone.trim())
    )
      return toast.error("أكمل اسم العميل ورقم الهوية والجوال");
    const cashValue = Number(cash) || 0;
    const networkValue = Number(network) || 0;
    const feeValue =
      contractScope === "international" ? Number(additionalFee) || 0 : 0;
    try {
      const resolvedCustomerId =
        customerMode === "new"
          ? await createCustomer.mutateAsync({
              ...newCustomer,
              phoneSecondary: newCustomer.phoneSecondary || undefined,
            })
          : Number(customerId);
      await createContract.mutateAsync({
        customerId: resolvedCustomerId,
        vehicleId: Number(vehicleId),
        vehicleMileage: Number(vehicleMileage),
        type,
        contractScope,
        startDate,
        expectedReturnDate,
        rentalAmount: formatMoney(unitRate),
        days: amounts.days,
        totalAmount: formatMoney(Number(amounts.total) + feeValue),
        paidAmount: formatMoney(cashValue + networkValue + feeValue),
        initialCashAmount: cashValue > 0 ? formatMoney(cashValue) : undefined,
        initialNetworkAmount:
          networkValue > 0 ? formatMoney(networkValue) : undefined,
        vehicleNoteResolution: openVehicleNotes.data?.length
          ? vehicleNoteResolution || undefined
          : undefined,
        notes:
          [
            feeValue ? `رسوم إضافية: ${formatMoney(feeValue)} ر.س` : "",
            notes.trim(),
          ]
            .filter(Boolean)
            .join("؛ ") || undefined,
      });
      toast.success(
        customerMode === "new"
          ? "تم حفظ العميل وإبرام العقد"
          : "تم إبرام العقد وحجز السيارة"
      );
      setVehicleId("");
      setVehicleMileage("");
      setCustomerId("");
      setCustomerSearch("");
      setNewCustomer({
        fullName: "",
        identityNumber: "",
        phone: "",
        phoneSecondary: "",
      });
      setCash("");
      setNetwork("");
      setAdditionalFee("");
      setContractScope("domestic_open");
      setNotes("");
      setVehicleNoteResolution("");
      await Promise.all([
        utils.vehicles.available.invalidate(),
        utils.contracts.list.invalidate(),
        utils.customers.list.invalidate(),
        utils.dashboard.invalidate(),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ العقد");
    }
  };
  const saving = createCustomer.isPending || createContract.isPending;
  return (
    <Card className="border-0 shadow-[0_8px_28px_rgba(22,34,53,0.06)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FilePlus2 className="h-5 w-5 text-[#139f95]" /> إبرام عقد جديد
        </CardTitle>
        <p className="text-xs text-slate-400">
          اختر السيارة من القائمة، ثم حدد العميل وأدخل الدفعات في خاناتها.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          السيارة المتاحة
          <select
            value={vehicleId}
            onChange={event => setVehicleId(event.target.value)}
            className="mt-2 h-12 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">اختر السيارة</option>
            {vehicles.data?.map(vehicle => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.make} {vehicle.model} — {vehicle.plateNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          العداد الحالي (كم)
          <Input
            type="number"
            min="0"
            value={vehicleMileage}
            onChange={event => {
              setVehicleMileage(event.target.value);
            }}
            placeholder={
              selectedVehicle
                ? String(selectedVehicle.mileage)
                : "العداد الحالي"
            }
            aria-label="العداد الحالي"
            className="mt-2"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          نوع العقد
          <select
            value={type}
            onChange={event => {
              setType(event.target.value as ContractType);
              setRate("");
            }}
            className="mt-2 h-12 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="daily">يومي</option>
            <option value="monthly">شهري (30 يوماً)</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          نطاق العقد
          <select
            value={contractScope}
            onChange={event => {
              setContractScope(event.target.value as ContractScope);
              if (event.target.value !== "international") setAdditionalFee("");
            }}
            className="mt-2 h-12 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="domestic_limited">داخلي — 150 كم يومياً</option>
            <option value="domestic_open">
              خارجي داخل السعودية — عداد مفتوح
            </option>
            <option value="international">خارجي دولي</option>
          </select>
        </label>
        <div className="sm:col-span-2">
          <div className="mb-2 flex gap-2">
            <Button
              type="button"
              variant={customerMode === "existing" ? "default" : "outline"}
              onClick={() => setCustomerMode("existing")}
              className="min-h-10 text-xs"
            >
              عميل مسجل
            </Button>
            <Button
              type="button"
              variant={customerMode === "new" ? "default" : "outline"}
              onClick={() => setCustomerMode("new")}
              className="min-h-10 text-xs"
            >
              عميل جديد
            </Button>
          </div>
          {customerMode === "existing" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={customerSearch}
                onChange={event => setCustomerSearch(event.target.value)}
                placeholder="بحث بالاسم أو الهوية أو الجوال"
                aria-label="بحث العميل"
              />
              <select
                value={customerId}
                onChange={event => setCustomerId(event.target.value)}
                className="h-12 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">اختر العميل</option>
                {filteredCustomers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.fullName} — {customer.identityNumber}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                value={newCustomer.fullName}
                onChange={event =>
                  setNewCustomer(current => ({
                    ...current,
                    fullName: event.target.value,
                  }))
                }
                placeholder="اسم العميل الجديد"
                aria-label="اسم العميل الجديد"
              />
              <Input
                value={newCustomer.identityNumber}
                onChange={event =>
                  setNewCustomer(current => ({
                    ...current,
                    identityNumber: event.target.value,
                  }))
                }
                placeholder="رقم الهوية"
                aria-label="هوية العميل الجديد"
              />
              <Input
                value={newCustomer.phone}
                onChange={event =>
                  setNewCustomer(current => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                placeholder="رقم الجوال الأساسي"
                aria-label="جوال العميل الأساسي"
                inputMode="tel"
              />
              <Input
                value={newCustomer.phoneSecondary}
                onChange={event =>
                  setNewCustomer(current => ({
                    ...current,
                    phoneSecondary: event.target.value,
                  }))
                }
                placeholder="رقم جوال إضافي (اختياري)"
                aria-label="جوال العميل الإضافي"
                inputMode="tel"
              />
            </div>
          )}
        </div>
        {openVehicleNotes.data?.length ? (
          <div className="sm:col-span-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-bold">
              توجد ملاحظة/خلل مسجل من العميل السابق. هل تم إصلاح الخلل؟
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["repaired", "تم الإصلاح"],
                  ["not_repaired", "لم يتم الإصلاح"],
                  ["not_needed", "لا يحتاج إلى إصلاح"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 font-semibold"
                >
                  <input
                    type="radio"
                    name="vehicle-note-resolution"
                    value={value}
                    checked={vehicleNoteResolution === value}
                    onChange={() => setVehicleNoteResolution(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-amber-800">
              اختيار «لم يتم الإصلاح» يسمح بإبرام العقد وتبقي الملاحظة للمتابعة
              الإدارية.
            </p>
          </div>
        ) : null}
        <label className="text-sm font-semibold text-slate-700">
          تاريخ البداية
          <Input
            type="date"
            value={startDate}
            onChange={event => setStartDate(event.target.value)}
            className="mt-2"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          تاريخ التسليم
          <Input
            type="date"
            min={startDate}
            value={expectedReturnDate}
            onChange={event => setExpectedReturnDate(event.target.value)}
            readOnly={type === "monthly"}
            className="mt-2"
          />
          {type === "monthly" && (
            <span className="mt-1 block text-[11px] font-normal text-slate-400">
              يُحسب تلقائياً بعد شهر تقويمي مع ضبط نهاية الشهر.
            </span>
          )}
        </label>
        <label className="text-sm font-semibold text-slate-700">
          سعر التأجير
          <Input
            type="number"
            min="0"
            step="0.01"
            value={rate}
            onChange={event => setRate(event.target.value)}
            placeholder={selectedVehicle ? formatMoney(defaultRate) : "السعر"}
            className="mt-2"
          />
        </label>
        {oilWarning && (
          <div className="sm:col-span-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-bold">تنبيه صيانة: {oilWarning}</p>
            <p className="mt-1">
              يمكن إبرام العقد، ويظهر التنبيه في السجل الإداري لمتابعة تغيير
              الزيت.
            </p>
          </div>
        )}
        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <p className="flex items-center gap-2">
            <CarFront className="h-4 w-4 text-[#139f95]" /> المدة:{" "}
            <b>{amounts.days || 0} يوم</b> — الإجمالي الأساسي:{" "}
            <b>{amounts.total || "0.00"} ر.س</b>
          </p>
        </div>
        <div className="sm:col-span-2 grid gap-3 rounded-xl border border-[#d8efec] bg-[#effaf8] p-3 sm:grid-cols-3">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={cash}
            onChange={event => setCash(event.target.value)}
            placeholder="دفعة كاش"
            aria-label="دفعة كاش"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            value={network}
            onChange={event => setNetwork(event.target.value)}
            placeholder="دفعة شبكة"
            aria-label="دفعة شبكة"
          />
          {contractScope === "international" && (
            <Input
              type="number"
              min="0"
              step="0.01"
              value={additionalFee}
              onChange={event => setAdditionalFee(event.target.value)}
              placeholder="رسوم التفويض الدولي"
              aria-label="رسوم التفويض الدولي"
            />
          )}
        </div>
        <Textarea
          value={notes}
          onChange={event => setNotes(event.target.value)}
          placeholder="ملاحظات العقد (اختياري)"
          aria-label="ملاحظات العقد"
          className="sm:col-span-2 min-h-20"
        />
        <Button
          onClick={submit}
          disabled={saving}
          className="sm:col-span-2 min-h-12 bg-[#139f95] font-bold hover:bg-[#0d938b]"
        >
          {saving ? "جارٍ حفظ العقد..." : "حفظ وإبرام العقد"}
        </Button>
      </CardContent>
    </Card>
  );
}
