import { calculateContractBalances } from "./contractBalances";
import { calculateContractTotals } from "./contractTotals";
import { calculateReturnSettlement } from "./returnSettlement";

export function calculateCloseSettlement(input: { baseTotal: string | number; expectedReturnDate: Date | string; closedAt: Date | string; rentalAmount: string | number; type: "daily" | "monthly"; paidAmount: string | number }) {
  const earlySettlement = calculateReturnSettlement({ expectedReturnDate: input.expectedReturnDate, returnedAt: input.closedAt, rentalAmount: input.rentalAmount, type: input.type });
  const adjustedBase = Math.max(0, Number(input.baseTotal) - Number(earlySettlement.remainingValue));
  const totals = calculateContractTotals({ baseTotal: adjustedBase, expectedReturnDate: input.expectedReturnDate, rentalAmount: input.rentalAmount, type: input.type, actualReturnDate: input.closedAt });
  const balances = calculateContractBalances({ baseTotal: totals.baseTotal, delayTotal: totals.delayTotal, paidAmount: input.paidAmount });
  return { remainingDays: earlySettlement.remainingDays, unusedValue: earlySettlement.remainingValue, adjustedBase: adjustedBase.toFixed(2), totals, balances, canClose: Number(balances.grandOutstanding) <= 0 };
}
