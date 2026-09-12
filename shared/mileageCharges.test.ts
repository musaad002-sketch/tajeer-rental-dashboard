import { describe, expect, it } from "vitest";
import { calculateMileageCharge } from "./mileageCharges";

describe("calculateMileageCharge", () => {
  it("charges internal excess mileage at half a rial per kilometer", () => {
    const result = calculateMileageCharge({ startMileage: 10000, endMileage: 10500, rentalDays: 2, scope: "internal" });
    expect(result.consumed).toBe(500);
    expect(result.allowed).toBe(300);
    expect(result.excess).toBe(200);
    expect(result.amount).toBe("100.00");
  });

  it("does not charge mileage for open-mileage external contracts", () => {
    const result = calculateMileageCharge({ startMileage: 10000, endMileage: 50000, rentalDays: 30, scope: "domestic" });
    expect(result.allowed).toBeNull();
    expect(result.excess).toBe(0);
    expect(result.amount).toBe("0.00");
  });

  it("does not allow a decreasing odometer to create a charge", () => {
    const result = calculateMileageCharge({ startMileage: 12000, endMileage: 11000, rentalDays: 1, scope: "internal" });
    expect(result.consumed).toBe(0);
    expect(result.excess).toBe(0);
    expect(result.due).toBe(false);
  });
});
