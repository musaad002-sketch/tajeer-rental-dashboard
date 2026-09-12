import { describe, expect, it } from "vitest";
import { allocateFinancialPayment } from "./financialLedger";

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
});
