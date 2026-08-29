import { calculateLateAmount, formatMoney } from "./contractCalculation";

export function calculateContractTotals(input: {
  baseTotal: string | number;
  expectedReturnDate: string | Date;
  rentalAmount: string | number;
  type: "daily" | "monthly";
  actualReturnDate?: string | Date | null;
  asOf?: Date;
}) {
  const baseTotal = Math.max(0, Number(input.baseTotal) || 0);
  const requestedAsOf = input.asOf ?? new Date();
  const actualReturn = input.actualReturnDate ? new Date(input.actualReturnDate) : null;
  const asOf = actualReturn && Number.isFinite(actualReturn.getTime()) && actualReturn < requestedAsOf ? actualReturn : requestedAsOf;
  const late = calculateLateAmount(input.expectedReturnDate, input.rentalAmount, input.type, asOf);
  const delayTotal = Number(late.amount);
  return {
    baseTotal: formatMoney(baseTotal),
    delayDays: late.days,
    delayTotal: formatMoney(delayTotal),
    grandTotal: formatMoney(baseTotal + delayTotal),
  };
}
