export type ContractMileageScope = "internal" | "domestic" | "international";

export const EXCESS_MILEAGE_RATE = 0.5;
export const INTERNAL_DAILY_MILEAGE_LIMIT = 150;

type MileageInput = {
  startMileage: number | string;
  endMileage: number | string;
  rentalDays: number;
  scope: ContractMileageScope;
  allowedMileage?: number | null;
  rate?: number;
};

function nonNegativeInteger(value: number | string) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : 0;
}

export function calculateMileageCharge(input: MileageInput) {
  const startMileage = nonNegativeInteger(input.startMileage);
  const endMileage = nonNegativeInteger(input.endMileage);
  const rentalDays = Math.max(0, Math.floor(Number(input.rentalDays) || 0));
  const consumed = Math.max(0, endMileage - startMileage);
  const allowed = input.allowedMileage !== undefined
    ? (input.allowedMileage == null ? null : Math.max(0, Math.trunc(Number(input.allowedMileage) || 0)))
    : input.scope === "internal"
      ? rentalDays * INTERNAL_DAILY_MILEAGE_LIMIT
      : null;
  const excess = allowed == null ? 0 : Math.max(0, consumed - allowed);
  const rate = input.rate ?? EXCESS_MILEAGE_RATE;
  const amount = excess * rate;

  return {
    startMileage,
    endMileage,
    consumed,
    allowed,
    excess,
    rate,
    amount: amount.toFixed(2),
    due: excess > 0,
  };
}
