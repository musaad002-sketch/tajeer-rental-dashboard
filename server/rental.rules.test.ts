import { describe, expect, it } from "vitest";
import { getOperatingCycle, isContractOverdue, isVehicleAvailable } from "@shared/rentalRules";

describe("rental operating rules", () => {
  it("uses the 6th through 5th as the operating cycle", () => {
    const cycle = getOperatingCycle(new Date(2026, 7, 27));
    expect(cycle.start).toEqual(new Date(2026, 7, 6));
    expect(cycle.end).toEqual(new Date(2026, 8, 5));
  });

  it("marks only contracts past their return date as overdue", () => {
    expect(isContractOverdue(new Date(2026, 7, 26), new Date(2026, 7, 27))).toBe(true);
    expect(isContractOverdue(new Date(2026, 7, 27), new Date(2026, 7, 27))).toBe(false);
  });

  it("blocks vehicles rented or under maintenance", () => {
    expect(isVehicleAvailable("available")).toBe(true);
    expect(isVehicleAvailable("available", 1)).toBe(false);
    expect(isVehicleAvailable("available", 0, 1)).toBe(false);
    expect(isVehicleAvailable("maintenance")).toBe(false);
  });
});

describe("vehicle availability edge cases", () => {
  it("rejects reserved and maintenance vehicles", () => {
    expect(isVehicleAvailable("reserved")).toBe(false);
    expect(isVehicleAvailable("maintenance")).toBe(false);
  });
});
