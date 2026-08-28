import { describe, expect, it } from "vitest";
import { allocatePayment } from "./paymentAllocation";

describe("allocatePayment", () => {
  it("pays previous outstanding before current outstanding", () => {
    expect(allocatePayment({ paymentAmount: 120, previousOutstanding: 100, currentOutstanding: 80 })).toEqual({
      appliedToPrevious: 100,
      appliedToCurrent: 20,
      unapplied: 0,
      previousRemaining: 0,
      currentRemaining: 60,
    });
  });

  it("keeps the remaining current amount when the payment only covers part of previous", () => {
    expect(allocatePayment({ paymentAmount: 40, previousOutstanding: 100, currentOutstanding: 80 })).toEqual({
      appliedToPrevious: 40,
      appliedToCurrent: 0,
      unapplied: 0,
      previousRemaining: 60,
      currentRemaining: 80,
    });
  });
});
