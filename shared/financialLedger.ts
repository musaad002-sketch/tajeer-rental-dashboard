export type FinancialLedgerInput = {
  previousBalance: number | string;
  delayBalance: number | string;
  excessMileageBalance?: number | string;
  otherBalance?: number | string;
  payment?: number | string;
};

export type FinancialLedgerResult = {
  previousBalance: string;
  delayBalance: string;
  excessMileageBalance: string;
  otherBalance: string;
  totalOutstanding: string;
  paymentApplied: string;
  paymentToPrevious: string;
  paymentToDelay: string;
  paymentToExcessMileage: string;
  paymentToOther: string;
  unappliedPayment: string;
};

function money(value: number | string | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function fixed(value: number) {
  return value.toFixed(2);
}

export function allocateFinancialPayment(input: FinancialLedgerInput): FinancialLedgerResult {
  let payment = money(input.payment);
  const previous = money(input.previousBalance);
  const delay = money(input.delayBalance);
  const excessMileage = money(input.excessMileageBalance);
  const other = money(input.otherBalance);

  const paymentToPrevious = Math.min(payment, previous);
  payment -= paymentToPrevious;
  const paymentToDelay = Math.min(payment, delay);
  payment -= paymentToDelay;
  const paymentToExcessMileage = Math.min(payment, excessMileage);
  payment -= paymentToExcessMileage;
  const paymentToOther = Math.min(payment, other);
  payment -= paymentToOther;

  return {
    previousBalance: fixed(previous - paymentToPrevious),
    delayBalance: fixed(delay - paymentToDelay),
    excessMileageBalance: fixed(excessMileage - paymentToExcessMileage),
    otherBalance: fixed(other - paymentToOther),
    totalOutstanding: fixed(previous - paymentToPrevious + delay - paymentToDelay + excessMileage - paymentToExcessMileage + other - paymentToOther),
    paymentApplied: fixed(money(input.payment) - payment),
    paymentToPrevious: fixed(paymentToPrevious),
    paymentToDelay: fixed(paymentToDelay),
    paymentToExcessMileage: fixed(paymentToExcessMileage),
    paymentToOther: fixed(paymentToOther),
    unappliedPayment: fixed(payment),
  };
}
