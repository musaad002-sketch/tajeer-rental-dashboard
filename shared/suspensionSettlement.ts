import { calculateContractBalances } from "./contractBalances";
import { calculateContractTotals } from "./contractTotals";
import { calculateReturnSettlement } from "./returnSettlement";

export function statusAfterSuspendedSettlement(input: { status: "active" | "overdue" | "suspended" | "closed" | "returned"; outstanding: string | number; expectedReturnDate: Date | string; now?: Date }) {
  if (input.status !== "suspended" || Number(input.outstanding) > 0) return null;
  const now = input.now ?? new Date();
  const expected = new Date(input.expectedReturnDate);
  now.setHours(0, 0, 0, 0);
  expected.setHours(0, 0, 0, 0);
  return expected < now ? "overdue" as const : "active" as const;
}

/** يثبت رصيد العقد عند التعليق ويخصم الأيام المستقبلية غير المستخدمة من المستحق. */
export function calculateSuspensionSettlement(input: { baseTotal: string | number; expectedReturnDate: Date | string; suspendedAt: Date | string; rentalAmount: string | number; type: "daily" | "monthly"; paidAmount: string | number }) {
  const unused = calculateReturnSettlement({ expectedReturnDate: input.expectedReturnDate, returnedAt: input.suspendedAt, rentalAmount: input.rentalAmount, type: input.type });
  const adjustedBase = Math.max(0, Number(input.baseTotal) - Number(unused.remainingValue));
  const totals = calculateContractTotals({ baseTotal: adjustedBase, expectedReturnDate: input.expectedReturnDate, rentalAmount: input.rentalAmount, type: input.type, actualReturnDate: input.suspendedAt, asOf: new Date(input.suspendedAt) });
  const balances = calculateContractBalances({ baseTotal: totals.baseTotal, delayTotal: totals.delayTotal, paidAmount: input.paidAmount });
  return { remainingDays: unused.remainingDays, unusedValue: unused.remainingValue, adjustedBase: Number(totals.baseTotal).toFixed(2), amountDueThroughSuspension: Number(totals.grandTotal).toFixed(2), totals, balances };
}
