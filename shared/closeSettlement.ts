import { calculateContractBalances } from "./contractBalances";
import { calculateContractTotals } from "./contractTotals";
import { calculateReturnSettlement } from "./returnSettlement";

/**
 * تسوية الإغلاق:
 * - يُحتسب أصل العقد حتى يوم الإغلاق الفعلي، ولا تُحتسب الأيام المستقبلية غير المدفوعة.
 * - إذا غطى المدفوع تكلفة الأيام المستخدمة وبقيت أيام مدفوعة، يُسجل الفرق كرصيد دائن للعميل
 *   ويُعامل الإغلاق كسجل استرجاع حتى تظهر السيارة في سجل الاسترجاعات.
 */
export function calculateCloseSettlement(input: {
  baseTotal: string | number;
  expectedReturnDate: Date | string;
  closedAt: Date | string;
  rentalAmount: string | number;
  type: "daily" | "monthly";
  paidAmount: string | number;
}) {
  const earlySettlement = calculateReturnSettlement({
    expectedReturnDate: input.expectedReturnDate,
    returnedAt: input.closedAt,
    rentalAmount: input.rentalAmount,
    type: input.type,
  });
  const adjustedBase = Math.max(0, Number(input.baseTotal) - Number(earlySettlement.remainingValue));
  const totals = calculateContractTotals({
    baseTotal: adjustedBase,
    expectedReturnDate: input.expectedReturnDate,
    rentalAmount: input.rentalAmount,
    type: input.type,
    actualReturnDate: input.closedAt,
    asOf: new Date(input.closedAt),
  });
  const balances = calculateContractBalances({
    baseTotal: totals.baseTotal,
    delayTotal: totals.delayTotal,
    paidAmount: input.paidAmount,
  });
  const paidAmount = Math.max(0, Number(input.paidAmount) || 0);
  const amountDueThroughClose = Number(totals.grandTotal);
  const customerCredit = Math.min(paidAmount, Math.max(0, paidAmount - amountDueThroughClose));
  const hasSurplusPaidDays = earlySettlement.remainingDays > 0 && paidAmount > Number(totals.baseTotal);

  return {
    remainingDays: earlySettlement.remainingDays,
    unusedValue: earlySettlement.remainingValue,
    adjustedBase: Number(totals.baseTotal).toFixed(2),
    amountDueThroughClose: amountDueThroughClose.toFixed(2),
    customerCredit: customerCredit.toFixed(2),
    hasSurplusPaidDays,
    shouldRecordReturn: hasSurplusPaidDays && customerCredit > 0,
    totals,
    balances,
    canClose: Number(balances.grandOutstanding) <= 0,
  };
}
