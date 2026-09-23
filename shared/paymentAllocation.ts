import { allocateFinancialPayment } from "./financialLedger";

export type PaymentAllocation = {
  appliedToPrevious: number;
  appliedToCurrent: number;
  appliedToExcessMileage: number;
  appliedToOther: number;
  unapplied: number;
  previousRemaining: number;
  currentRemaining: number;
  excessMileageRemaining: number;
  otherRemaining: number;
};

export function allocatePayment(input: {
  paymentAmount: number;
  previousOutstanding: number;
  currentOutstanding: number;
  excessMileageOutstanding?: number;
  otherOutstanding?: number;
}): PaymentAllocation {
  const ledger = allocateFinancialPayment({
    previousBalance: input.previousOutstanding,
    delayBalance: input.currentOutstanding,
    excessMileageBalance: input.excessMileageOutstanding,
    otherBalance: input.otherOutstanding,
    payment: input.paymentAmount,
  });
  return {
    appliedToPrevious: Number(ledger.paymentToPrevious),
    appliedToCurrent: Number(ledger.paymentToDelay),
    appliedToExcessMileage: Number(ledger.paymentToExcessMileage),
    appliedToOther: Number(ledger.paymentToOther),
    unapplied: Number(ledger.unappliedPayment),
    previousRemaining: Number(ledger.previousBalance),
    currentRemaining: Number(ledger.delayBalance),
    excessMileageRemaining: Number(ledger.excessMileageBalance),
    otherRemaining: Number(ledger.otherBalance),
  };
}
