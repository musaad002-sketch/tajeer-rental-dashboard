const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateTime(value: string | Date) {
  if (value instanceof Date) return new Date(value.getTime());
  return new Date(/T|\s/.test(value) ? value : `${value}T00:00:00`);
}

export function rentalDays(startDate: string, returnDate: string) {
  if (!startDate || !returnDate) return 0;
  const start = parseDateTime(startDate).getTime();
  const end = parseDateTime(returnDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.max(1, Math.ceil((end - start) / DAY_MS));
}

export function formatMoney(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

export function calculateMonthlyEntitlements(startDate: string, returnDate: string, monthlyRate: string | number) {
  const start = parseDateTime(startDate);
  const end = parseDateTime(returnDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return [];
  const rate = Number(monthlyRate) || 0;
  const result: Array<{ month: number; startDate: string; endDate: string; amount: string }> = [];
  let periodStart = new Date(start.getTime());
  let month = 1;
  while (periodStart < end) {
    const periodEnd = new Date(Math.min(end.getTime(), periodStart.getTime() + 30 * DAY_MS));
    result.push({ month, startDate: periodStart.toISOString(), endDate: periodEnd.toISOString(), amount: formatMoney(rate) });
    periodStart = periodEnd;
    month += 1;
  }
  return result;
}

export function calculateContractAmounts(startDate: string, returnDate: string, unitRate: string | number, paidAmount: string | number = 0, type: "daily" | "monthly" = "daily") {
  const days = rentalDays(startDate, returnDate);
  const units = type === "monthly" ? (days > 0 ? Math.max(1, Math.ceil(days / 30)) : 0) : days;
  const billableDays = type === "monthly" ? units * 30 : days;
  const rate = Number(unitRate) || 0;
  const total = units > 0 && rate > 0 ? units * rate : 0;
  const paid = Number(paidAmount) || 0;
  return { days: billableDays, units, rate, total: total > 0 ? formatMoney(total) : "", paid: formatMoney(paid), remaining: formatMoney(Math.max(0, total - paid)) };
}

function dateAtMidnight(value: string | Date) {
  const date = parseDateTime(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function lateDays(expectedReturnDate: string | Date, asOf: Date = new Date(), graceHours = 0) {
  const expected = parseDateTime(expectedReturnDate).getTime() + Math.max(0, graceHours) * 60 * 60 * 1000;
  const elapsed = asOf.getTime() - expected;
  if (!Number.isFinite(expected) || !Number.isFinite(asOf.getTime()) || elapsed <= 0) return 0;
  return Math.ceil(elapsed / DAY_MS);
}

export function calculateLateAmount(expectedReturnDate: string | Date, unitRate: string | number, type: "daily" | "monthly", asOf: Date = new Date(), graceHours = 0) {
  const days = lateDays(expectedReturnDate, asOf, graceHours);
  const rate = Number(unitRate) || 0;
  const dailyRate = type === "monthly" ? rate / 30 : rate;
  return { days, amount: formatMoney(Math.max(0, days * dailyRate)) };
}

export function accruedRentalAmount(startDate: string | Date, unitRate: string | number, type: "daily" | "monthly", asOf: Date = new Date()) {
  const start = parseDateTime(startDate).getTime();
  const today = asOf.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(today) || today < start) return "0.00";
  const usedDays = Math.max(1, Math.ceil((today - start) / DAY_MS));
  const rate = Number(unitRate) || 0;
  return formatMoney(usedDays * (type === "monthly" ? rate / 30 : rate));
}

export function isFinanciallyDistressed(input: { startDate: string | Date; unitRate: string | number; type: "daily" | "monthly"; paidAmount: string | number; asOf?: Date }) {
  const accrued = Number(accruedRentalAmount(input.startDate, input.unitRate, input.type, input.asOf));
  const paid = Number(input.paidAmount) || 0;
  return accrued > 0 && paid < accrued;
}

export function monthlyReturnDate(startDate: string) {
  const date = new Date(`${startDate}T00:00:00`);
  if (!startDate || !Number.isFinite(date.getTime())) return "";
  const requestedDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  const lastDayOfNextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(requestedDay, lastDayOfNextMonth));
  return date.toISOString().slice(0, 10);
}

export function extendReturnDate(expectedReturnDate: string | Date, extensionDays: number) {
  if (!Number.isInteger(extensionDays) || extensionDays <= 0) return null;
  const date = dateAtMidnight(expectedReturnDate);
  if (!Number.isFinite(date.getTime())) return null;
  date.setDate(date.getDate() + extensionDays);
  return date;
}
