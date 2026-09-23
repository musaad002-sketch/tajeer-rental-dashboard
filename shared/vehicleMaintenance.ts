import { calculateMileageCharge } from "./mileageCharges";

export function calculateOilMaintenance(input: {
  currentMileage: number;
  lastOilChangeMileage?: number | null;
  oilChangeInterval?: number | null;
  lastOilChangeDate?: Date | string | null;
  now?: Date;
  maxDaysSinceOilChange?: number;
}) {
  if (input.lastOilChangeMileage == null && !input.lastOilChangeDate) {
    return { travelled: null, remaining: null, daysSinceOilChange: null, due: false, dueByMileage: false, dueByTime: false };
  }
  const interval = Number.isFinite(input.oilChangeInterval) && Number(input.oilChangeInterval) > 0
    ? Math.trunc(Number(input.oilChangeInterval))
    : 5000;
  const travelled = input.lastOilChangeMileage == null
    ? null
    : Math.max(0, Math.trunc(input.currentMileage) - Math.trunc(input.lastOilChangeMileage));
  const remaining = travelled == null ? null : Math.max(0, interval - travelled);
  const now = input.now ?? new Date();
  const lastDate = input.lastOilChangeDate ? new Date(input.lastOilChangeDate) : null;
  const daysSinceOilChange = lastDate && !Number.isNaN(lastDate.getTime())
    ? Math.max(0, Math.floor((now.getTime() - lastDate.getTime()) / 86400000))
    : null;
  const maxDays = input.maxDaysSinceOilChange ?? 40;
  const dueByMileage = travelled != null && travelled >= interval;
  const dueByTime = daysSinceOilChange != null && daysSinceOilChange >= maxDays;
  return { travelled, remaining, daysSinceOilChange, due: dueByMileage || dueByTime, dueByMileage, dueByTime };
}

export function isMileageAdvanceValid(currentMileage: number, nextMileage: number) {
  return Number.isInteger(nextMileage) && nextMileage >= 0 && nextMileage >= currentMileage;
}

export function mileageWarningMessage(input: ReturnType<typeof calculateOilMaintenance>) {
  if (!input.due) return null;
  if (input.dueByMileage && input.dueByTime) return "حان موعد تغيير الزيت بسبب المسافة ومرور 40 يوماً";
  if (input.dueByMileage) return "حان موعد تغيير الزيت بسبب المسافة المقطوعة";
  return "حان موعد تغيير الزيت بعد مرور 40 يوماً";
}

export function calculateExtraMileageCharge(input: { currentMileage: number; startingMileage: number; allowedMileage: number; rate?: number }) {
  const result = calculateMileageCharge({
    startMileage: input.startingMileage,
    endMileage: input.currentMileage,
    rentalDays: 0,
    scope: "internal",
    allowedMileage: input.allowedMileage,
    rate: input.rate,
  });
  return {
    consumed: result.consumed,
    extraMileage: result.excess,
    charge: Number(result.amount),
  };
}

export function hasOilOverride(details?: string | null) {
  return Boolean(details?.includes("مسؤوليتي") || details?.includes("تجاوز تنبيه الزيت"));
}

export function isVehicleMileageRequired(operation: "create" | "extension" | "vehicle_swap" | "close" | "return" | "suspend") {
  return ["create", "vehicle_swap", "close", "return", "suspend"].includes(operation);
}

export function getContractGraceHours(input: { type: "daily" | "monthly"; contractScope?: "domestic_limited" | "domestic_open" | "international"; days?: number }) {
  if (input.type === "monthly") return 12;
  if (input.contractScope === "international" || input.contractScope === "domestic_open") return 4;
  return (input.days ?? 0) <= 3 ? 2 : 0;
}
