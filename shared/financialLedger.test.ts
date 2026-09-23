import { describe, expect, it } from "vitest";
import { allocateFinancialPayment, calculateFinancialPaymentAllocations } from "./financialLedger";

describe("allocateFinancialPayment", () => {
  it("pays previous balance before delay and later balances", () => {
    const result = allocateFinancialPayment({
      previousBalance: 500,
      delayBalance: 200,
      excessMileageBalance: 100,
      otherBalance: 50,
      payment: 650,
    });

    expect(result.paymentToPrevious).toBe("500.00");
    expect(result.paymentToDelay).toBe("150.00");
    expect(result.paymentToExcessMileage).toBe("0.00");
    expect(result.totalOutstanding).toBe("200.00");
  });

  it("leaves an overpayment unapplied instead of hiding it in rent", () => {
    const result = allocateFinancialPayment({ previousBalance: 100, delayBalance: 50, payment: 200 });
    expect(result.paymentApplied).toBe("150.00");
    expect(result.unappliedPayment).toBe("50.00");
    expect(result.totalOutstanding).toBe("0.00");
  });

  it("supports a payment that only settles excess mileage after prior balances", () => {
    const result = allocateFinancialPayment({ previousBalance: 0, delayBalance: 0, excessMileageBalance: 125, payment: 80 });
    expect(result.paymentToExcessMileage).toBe("80.00");
    expect(result.excessMileageBalance).toBe("45.00");
  });

  it("returns the canonical previous, overdue, mileage, and other order", () => {
    expect(calculateFinancialPaymentAllocations(1000, {
      remaining_contract_balance: 100,
      current_late_charges: 200,
      excess_mileage: 300,
      other_liability: 400,
    })).toEqual([
      { allocationType: "remaining_contract_balance", priority: 1, amount: "100.00" },
      { allocationType: "current_late_charges", priority: 2, amount: "200.00" },
      { allocationType: "excess_mileage", priority: 3, amount: "300.00" },
      { allocationType: "other_liability", priority: 4, amount: "400.00" },
    ]);
  });

  it.each([0, -1])("rejects a non-positive payment amount: %s", amount => {
    expect(() => calculateFinancialPaymentAllocations(amount, {
      remaining_contract_balance: 100,
      current_late_charges: 100,
      excess_mileage: 100,
      other_liability: 100,
    })).toThrow("أكبر من صفر");
  });
});
