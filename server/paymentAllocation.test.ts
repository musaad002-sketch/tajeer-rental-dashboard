import { describe, expect, it } from "vitest";
import { calculatePaymentAllocations } from "./paymentAllocation";

describe("payment allocation waterfall", () => {
  it("implements 900 - 300 - 350 = 250, then 250 + 400 = 650", () => {
    const rows = calculatePaymentAllocations("650", {
      remaining_contract_balance: 250,
      current_late_charges: 400,
      excess_mileage: 0,
      other_liability: 0,
    });
    expect(rows).toEqual([
      { allocationType: "remaining_contract_balance", priority: 1, amount: "250.00" },
      { allocationType: "current_late_charges", priority: 2, amount: "400.00" },
    ]);
    expect(rows.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(650);
  });

  it("allocates a partial payment to the first bucket only", () => {
    expect(calculatePaymentAllocations(100, { remaining_contract_balance: 250, current_late_charges: 400, excess_mileage: 80, other_liability: 20 })).toEqual([
      { allocationType: "remaining_contract_balance", priority: 1, amount: "100.00" },
    ]);
  });

  it("moves across late charges, excess mileage, and other liability in order", () => {
    expect(calculatePaymentAllocations(600, { remaining_contract_balance: 0, current_late_charges: 400, excess_mileage: 150, other_liability: 100 })).toEqual([
      { allocationType: "current_late_charges", priority: 2, amount: "400.00" },
      { allocationType: "excess_mileage", priority: 3, amount: "150.00" },
      { allocationType: "other_liability", priority: 4, amount: "50.00" },
    ]);
  });

  it("rejects zero, negative, and unapplied overpayment amounts", () => {
    const balances = { remaining_contract_balance: 250, current_late_charges: 400, excess_mileage: 0, other_liability: 0 };
    expect(() => calculatePaymentAllocations(0, balances)).toThrow("أكبر من صفر");
    expect(() => calculatePaymentAllocations(-1, balances)).toThrow("أكبر من صفر");
    expect(() => calculatePaymentAllocations(651, balances)).toThrow("unapplied balance");
  });
});
