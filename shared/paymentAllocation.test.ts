import { describe, expect, it } from "vitest";
import { allocatePayment } from "./paymentAllocation";

describe("allocatePayment", () => {
  it("pays previous outstanding before current outstanding", () => {
    expect(allocatePayment({ paymentAmount: 120, previousOutstanding: 100, currentOutstanding: 80 })).toMatchObject({
      appliedToPrevious: 100,
      appliedToCurrent: 20,
      appliedToExcessMileage: 0,
      unapplied: 0,
      previousRemaining: 0,
      currentRemaining: 60,
      excessMileageRemaining: 0,
    });
  });

  it("keeps the remaining current amount when the payment only covers part of previous", () => {
    expect(allocatePayment({ paymentAmount: 40, previousOutstanding: 100, currentOutstanding: 80 })).toMatchObject({
      appliedToPrevious: 40,
      appliedToCurrent: 0,
      appliedToExcessMileage: 0,
      unapplied: 0,
      previousRemaining: 60,
      currentRemaining: 80,
      excessMileageRemaining: 0,
    });
  });

  it("allocates to excess mileage only after previous and current balances", () => {
    expect(allocatePayment({ paymentAmount: 50, previousOutstanding: 0, currentOutstanding: 30, excessMileageOutstanding: 100 })).toMatchObject({
      appliedToPrevious: 0,
      appliedToCurrent: 30,
      appliedToExcessMileage: 20,
      unapplied: 0,
      excessMileageRemaining: 80,
    });
  });
});
