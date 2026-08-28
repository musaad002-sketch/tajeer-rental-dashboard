export function money(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function calculateRemaining(totalAmount: string | number, paidAmount: string | number) {
  return Math.max(0, money(totalAmount) - money(paidAmount));
}

export function addAdditionalFee(totalAmount: string | number, fee: string | number) {
  return (money(totalAmount) + money(fee)).toFixed(2);
}

export function calculateRateAdjustedTotal(input: { currentTotal: string | number; currentRate: string | number; nextRate: string | number; days: number; type: "daily" | "monthly" }) {
  const units = input.type === "monthly" ? Math.max(1, Math.ceil(input.days / 30)) : Math.max(1, input.days);
  const existingExtras = money(input.currentTotal) - money(input.currentRate) * units;
  return Math.max(0, existingExtras + money(input.nextRate) * units).toFixed(2);
}
