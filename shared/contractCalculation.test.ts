import { describe, expect, it } from "vitest";
import { calculateContractAmounts, calculateLateAmount, lateDays, monthlyReturnDate, rentalDays } from "./contractCalculation";

describe("contract calculation", () => {
  it("recalculates days and total when the expected return date changes", () => {
    expect(rentalDays("2026-08-28", "2026-08-29")).toBe(1);
    expect(calculateContractAmounts("2026-08-28", "2026-08-29", "180", "50")).toEqual({ days: 1, units: 1, rate: 180, total: "180.00", paid: "50.00", remaining: "130.00" });
    expect(calculateContractAmounts("2026-08-28", "2026-09-02", "180", "50")).toEqual({ days: 5, units: 5, rate: 180, total: "900.00", paid: "50.00", remaining: "850.00" });
  });

  it("uses monthly units for monthly contracts", () => {
    expect(calculateContractAmounts("2026-08-28", "2026-10-01", "3000", "0", "monthly")).toEqual({ days: 60, units: 2, rate: 3000, total: "6000.00", paid: "0.00", remaining: "6000.00" });
  });

  it("calculates monthly return dates and clamps short months", () => {
    expect(monthlyReturnDate("2026-01-15")).toBe("2026-02-15");
    expect(monthlyReturnDate("2026-01-31")).toBe("2026-02-28");
    expect(monthlyReturnDate("2028-01-31")).toBe("2028-02-29");
    expect(monthlyReturnDate("2026-03-31")).toBe("2026-04-30");
  });

  it("does not keep a stale total when the date range is invalid", () => {
    expect(calculateContractAmounts("2026-08-28", "2026-08-27", "180", "50")).toEqual({ days: 0, units: 0, rate: 180, total: "", paid: "50.00", remaining: "0.00" });
  });

  it("calculates daily late amount separately from the unpaid balance", () => {
    const asOf = new Date("2026-09-03T12:00:00");
    expect(lateDays("2026-09-01", asOf)).toBe(2);
    expect(calculateLateAmount("2026-09-01", "180", "daily", asOf)).toEqual({ days: 2, amount: "360.00" });
  });

  it("calculates monthly late amount at monthly rate divided by 30", () => {
    const asOf = new Date("2026-09-04T12:00:00");
    expect(calculateLateAmount("2026-09-01", "3000", "monthly", asOf)).toEqual({ days: 3, amount: "300.00" });
  });

  it("returns zero late amount on or before the expected return date", () => {
    const asOf = new Date("2026-09-01T12:00:00");
    expect(calculateLateAmount("2026-09-01", "180", "daily", asOf)).toEqual({ days: 0, amount: "0.00" });
  });
});


describe("financial distress", () => {
  it("flags an overdue daily contract when paid amount is below accrued rent", async () => {
    const { isFinanciallyDistressed } = await import("./contractCalculation");
    expect(isFinanciallyDistressed({ startDate: "2026-08-01", unitRate: "100", type: "daily", paidAmount: "100", asOf: new Date("2026-08-05T12:00:00") })).toBe(true);
  });

  it("flags a monthly contract with zero late days when payments do not cover used days", async () => {
    const { accruedRentalAmount, isFinanciallyDistressed } = await import("./contractCalculation");
    expect(accruedRentalAmount("2026-08-01", "3000", "monthly", new Date("2026-08-01T12:00:00"))).toBe("100.00");
    expect(isFinanciallyDistressed({ startDate: "2026-08-01", unitRate: "3000", type: "monthly", paidAmount: "0", asOf: new Date("2026-08-01T12:00:00") })).toBe(true);
  });

  it("does not flag a fully covered accrued amount", async () => {
    const { isFinanciallyDistressed } = await import("./contractCalculation");
    expect(isFinanciallyDistressed({ startDate: "2026-08-01", unitRate: "100", type: "daily", paidAmount: "500", asOf: new Date("2026-08-05T12:00:00") })).toBe(false);
  });
});


describe("contract extension", () => {
  it("extends the existing return date without changing the contract identity", async () => {
    const { extendReturnDate } = await import("./contractCalculation");
    expect(extendReturnDate("2026-08-10", 5)?.toISOString().slice(0, 10)).toBe("2026-08-15");
  });

  it("rejects a zero or negative extension", async () => {
    const { extendReturnDate } = await import("./contractCalculation");
    expect(extendReturnDate("2026-08-10", 0)).toBeNull();
    expect(extendReturnDate("2026-08-10", -1)).toBeNull();
  });
});
