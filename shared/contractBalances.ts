import { allocateFinancialPayment } from "./financialLedger";

/**
 * يحافظ هذا المساعد على واجهة المشروع القديمة، لكنه يستخدم الآن نفس أولوية
 * التوزيع الموحدة: المتبقي السابق ثم التأخير ثم الكيلومترات الزائدة ثم الديون الأخرى.
 */
export function calculateContractBalances(input: {
  baseTotal: string | number;
  delayTotal: string | number;
  paidAmount: string | number;
  excessMileageBalance?: string | number;
  otherBalance?: string | number;
}) {
  const ledger = allocateFinancialPayment({
    previousBalance: input.baseTotal,
    delayBalance: input.delayTotal,
    excessMileageBalance: input.excessMileageBalance,
    otherBalance: input.otherBalance,
    payment: input.paidAmount,
  });

  return {
    previousOutstanding: ledger.previousBalance,
    currentOutstanding: ledger.delayBalance,
    excessMileageOutstanding: ledger.excessMileageBalance,
    otherOutstanding: ledger.otherBalance,
    grandOutstanding: ledger.totalOutstanding,
    paymentToPrevious: ledger.paymentToPrevious,
    paymentToDelay: ledger.paymentToDelay,
    paymentToExcessMileage: ledger.paymentToExcessMileage,
    paymentToOther: ledger.paymentToOther,
    unappliedPayment: ledger.unappliedPayment,
  };
}
