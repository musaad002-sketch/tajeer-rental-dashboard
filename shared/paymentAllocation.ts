export type PaymentAllocation = {
  appliedToPrevious: number;
  appliedToCurrent: number;
  unapplied: number;
  previousRemaining: number;
  currentRemaining: number;
};

export function allocatePayment(input: {
  paymentAmount: number;
  previousOutstanding: number;
  currentOutstanding: number;
}): PaymentAllocation {
  const paymentAmount = Math.max(0, Number(input.paymentAmount) || 0);
  const previousOutstanding = Math.max(0, Number(input.previousOutstanding) || 0);
  const currentOutstanding = Math.max(0, Number(input.currentOutstanding) || 0);
  const appliedToPrevious = Math.min(paymentAmount, previousOutstanding);
  const remainingPayment = paymentAmount - appliedToPrevious;
  const appliedToCurrent = Math.min(remainingPayment, currentOutstanding);

  return {
    appliedToPrevious: Number(appliedToPrevious.toFixed(2)),
    appliedToCurrent: Number(appliedToCurrent.toFixed(2)),
    unapplied: Number((remainingPayment - appliedToCurrent).toFixed(2)),
    previousRemaining: Number((previousOutstanding - appliedToPrevious).toFixed(2)),
    currentRemaining: Number((currentOutstanding - appliedToCurrent).toFixed(2)),
  };
}
