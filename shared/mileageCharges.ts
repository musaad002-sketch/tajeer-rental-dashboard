export type ContractMileageScope = "internal" | "domestic" | "international";

export const EXCESS_MILEAGE_RATE = 0.5;
export const INTERNAL_DAILY_MILEAGE_LIMIT = 150;

type MileageInput = {
  startMileage: number | string;
  endMileage: number | string;
  rentalDays: number;
  scope: ContractMileageScope;
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
  const allowed = input.scope === "internal" ? rentalDays * INTERNAL_DAILY_MILEAGE_LIMIT : null;
  const excess = allowed == null ? 0 : Math.max(0, consumed - allowed);
  const amount = excess * EXCESS_MILEAGE_RATE;

  return {
    startMileage,
    endMileage,
    consumed,
    allowed,
    excess,
    rate: EXCESS_MILEAGE_RATE,
    amount: amount.toFixed(2),
    due: excess > 0,
  };
}
