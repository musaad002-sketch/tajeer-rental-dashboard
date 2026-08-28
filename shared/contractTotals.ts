import { calculateLateAmount, formatMoney } from "./contractCalculation";

export function calculateContractTotals(input: {
  baseTotal: string | number;
  expectedReturnDate: string | Date;
  rentalAmount: string | number;
  type: "daily" | "monthly";
  asOf?: Date;
}) {
  const baseTotal = Math.max(0, Number(input.baseTotal) || 0);
  const late = calculateLateAmount(input.expectedReturnDate, input.rentalAmount, input.type, input.asOf);
  const delayTotal = Number(late.amount);
  return {
    baseTotal: formatMoney(baseTotal),
    delayDays: late.days,
    delayTotal: formatMoney(delayTotal),
    grandTotal: formatMoney(baseTotal + delayTotal),
  };
}
