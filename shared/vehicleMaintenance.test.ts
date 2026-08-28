import { describe, expect, it } from "vitest";
import { calculateOilMaintenance, isMileageAdvanceValid } from "./vehicleMaintenance";

describe("calculateOilMaintenance", () => {
  it("calculates remaining mileage from the last oil reading", () => {
    expect(calculateOilMaintenance({ currentMileage: 82_000, lastOilChangeMileage: 79_000, oilChangeInterval: 5_000 })).toEqual({ travelled: 3_000, remaining: 2_000, due: false });
  });

  it("marks service due without returning a negative distance", () => {
    expect(calculateOilMaintenance({ currentMileage: 85_200, lastOilChangeMileage: 80_000, oilChangeInterval: 5_000 })).toEqual({ travelled: 5_200, remaining: 0, due: true });
  });

  it("keeps maintenance unknown when no previous oil reading exists", () => {
    expect(calculateOilMaintenance({ currentMileage: 20_000, lastOilChangeMileage: null, oilChangeInterval: 5_000 })).toEqual({ travelled: null, remaining: null, due: false });
  });

  it("accepts equal or higher odometer readings and rejects rollback", () => {
    expect(isMileageAdvanceValid(80_000, 80_000)).toBe(true);
    expect(isMileageAdvanceValid(80_000, 80_250)).toBe(true);
    expect(isMileageAdvanceValid(80_000, 79_999)).toBe(false);
  });
});
