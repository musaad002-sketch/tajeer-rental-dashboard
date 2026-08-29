import { formatMoney } from "./contractCalculation";

/** يحسب الأيام المتبقية شاملاً يوم الاسترجاع واليوم المتوقع للتسليم، وقيمتها بعد الإرجاع المبكر. */
export function calculateReturnSettlement(input: { expectedReturnDate: Date | string; returnedAt: Date | string; rentalAmount: string | number; type: "daily" | "monthly" }) {
  const expected = new Date(input.expectedReturnDate);
  const returned = new Date(input.returnedAt);
  expected.setHours(0, 0, 0, 0);
  returned.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((expected.getTime() - returned.getTime()) / 86400000);
  const remainingDays = Math.max(0, diffDays + 1);
  const dailyRate = input.type === "monthly" ? Number(input.rentalAmount) / 30 : Number(input.rentalAmount);
  const remainingValue = Math.max(0, remainingDays * dailyRate);
  return { remainingDays, dailyRate: formatMoney(dailyRate), remainingValue: formatMoney(remainingValue) };
}
