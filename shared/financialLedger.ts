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

export const FINANCIAL_ALLOCATION_ORDER = [
  "remaining_contract_balance",
  "current_late_charges",
  "excess_mileage",
  "other_liability",
] as const;
export type FinancialAllocationType = (typeof FINANCIAL_ALLOCATION_ORDER)[number];
export type FinancialAllocationRow = {
  allocationType: FinancialAllocationType;
  priority: number;
  amount: string;
};

function money(value: number | string | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function fixed(value: number) {
  return value.toFixed(2);
}

export function calculateFinancialPaymentAllocations(
  paymentInput: number | string,
  balances: Record<FinancialAllocationType, number | string | undefined>,
  options: { allowUnapplied?: boolean } = {}
) {
  const payment = money(paymentInput);
  if (payment <= 0) throw new Error("مبلغ الدفعة يجب أن يكون أكبر من صفر");
  let remaining = payment;
  const allocations: FinancialAllocationRow[] = [];
  FINANCIAL_ALLOCATION_ORDER.forEach((allocationType, index) => {
    const applied = Math.min(remaining, money(balances[allocationType]));
    if (applied > 0) {
      allocations.push({ allocationType, priority: index + 1, amount: fixed(applied) });
      remaining = Math.round((remaining - applied) * 100) / 100;
    }
  });
  if (remaining > 0 && !options.allowUnapplied)
    throw new Error("تعذر توزيع مبلغ الدفعة بالكامل؛ لا يوجد unapplied balance");
  const total = allocations.reduce((sum, row) => sum + Number(row.amount), 0);
  if (total - payment > 0.005) throw new Error("مجموع التوزيعات لا يساوي مبلغ الدفعة");
  if (allocations.some(row => Number(row.amount) <= 0)) throw new Error("لا يمكن حفظ allocation بمبلغ غير موجب");
  return allocations;
}

export function allocateFinancialPayment(input: FinancialLedgerInput): FinancialLedgerResult {
  const payment = money(input.payment);
  const previous = money(input.previousBalance);
  const delay = money(input.delayBalance);
  const excessMileage = money(input.excessMileageBalance);
  const other = money(input.otherBalance);
  const rows = payment > 0
    ? calculateFinancialPaymentAllocations(payment, {
        remaining_contract_balance: previous,
        current_late_charges: delay,
        excess_mileage: excessMileage,
        other_liability: other,
      }, { allowUnapplied: true })
    : [];
  const applied = new Map(rows.map(row => [row.allocationType, Number(row.amount)]));
  const paymentToPrevious = applied.get("remaining_contract_balance") ?? 0;
  const paymentToDelay = applied.get("current_late_charges") ?? 0;
  const paymentToExcessMileage = applied.get("excess_mileage") ?? 0;
  const paymentToOther = applied.get("other_liability") ?? 0;
  const unapplied = Math.max(0, payment - paymentToPrevious - paymentToDelay - paymentToExcessMileage - paymentToOther);

  return {
    previousBalance: fixed(previous - paymentToPrevious),
    delayBalance: fixed(delay - paymentToDelay),
    excessMileageBalance: fixed(excessMileage - paymentToExcessMileage),
    otherBalance: fixed(other - paymentToOther),
    totalOutstanding: fixed(previous - paymentToPrevious + delay - paymentToDelay + excessMileage - paymentToExcessMileage + other - paymentToOther),
    paymentApplied: fixed(payment - unapplied),
    paymentToPrevious: fixed(paymentToPrevious),
    paymentToDelay: fixed(paymentToDelay),
    paymentToExcessMileage: fixed(paymentToExcessMileage),
    paymentToOther: fixed(paymentToOther),
    unappliedPayment: fixed(unapplied),
  };
}
