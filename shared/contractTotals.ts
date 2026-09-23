import { calculateLateAmount, formatMoney } from "./contractCalculation";
import { getContractGraceHours } from "./vehicleMaintenance";

export function calculateContractTotals(input: {
  baseTotal: string | number;
  expectedReturnDate: string | Date;
  rentalAmount: string | number;
  type: "daily" | "monthly";
  contractScope?: "domestic_limited" | "domestic_open" | "international";
  days?: number;
  graceHours?: number;
  actualReturnDate?: string | Date | null;
  previousDueAmount?: string | number;
  asOf?: Date;
}) {
  const baseTotal = Math.max(0, Number(input.baseTotal) || 0);
  const requestedAsOf = input.asOf ?? new Date();
  const actualReturn = input.actualReturnDate ? new Date(input.actualReturnDate) : null;
  const asOf = actualReturn && Number.isFinite(actualReturn.getTime()) && actualReturn < requestedAsOf ? actualReturn : requestedAsOf;
  const graceHours = input.graceHours ?? getContractGraceHours({ type: input.type, contractScope: input.contractScope, days: input.days });
  const late = calculateLateAmount(input.expectedReturnDate, input.rentalAmount, input.type, asOf, graceHours);
  const delayTotal = Number(late.amount);
  const previousDueAmount = Math.max(0, Number(input.previousDueAmount) || 0);
  return {
    baseTotal: formatMoney(baseTotal),
    contractReferenceTotal: formatMoney(baseTotal),
    delayDays: late.days,
    delayTotal: formatMoney(delayTotal),
    amountDueThroughDate: formatMoney(baseTotal + delayTotal),
    // The contract reference is already represented by the previous balance.
    // Only newly accrued delay is collectible in the follow-up total.
    grandTotal: formatMoney(previousDueAmount + delayTotal),
  };
}
