import { formatMoney } from "./contractCalculation";

/**
 * يقسم المبلغ المستحق إلى رصيد سابق ورصيد حالي:
 * الرصيد السابق هو الالتزام الأساسي للعقد (أو الشهر السابق) الذي لم يسدد بعد.
 * الرصيد الحالي هو رسوم التأخير المتبقية بعد استنفاد أي دفعات زائدة عن الأساس.
 */
export function calculateContractBalances(input: {
  baseTotal: string | number;
  delayTotal: string | number;
  paidAmount: string | number;
}) {
  const baseTotal = Math.max(0, Number(input.baseTotal) || 0);
  const delayTotal = Math.max(0, Number(input.delayTotal) || 0);
  const paidAmount = Math.max(0, Number(input.paidAmount) || 0);
  const previousOutstanding = Math.max(0, baseTotal - paidAmount);
  const paymentAfterPrevious = Math.max(0, paidAmount - baseTotal);
  const currentOutstanding = Math.max(0, delayTotal - paymentAfterPrevious);
  const grandOutstanding = previousOutstanding + currentOutstanding;

  return {
    previousOutstanding: formatMoney(previousOutstanding),
    currentOutstanding: formatMoney(currentOutstanding),
    grandOutstanding: formatMoney(grandOutstanding),
  };
}
