import { describe, expect, it } from "vitest";
import { calculateExtraMileageCharge, calculateOilMaintenance, getContractGraceHours, isMileageAdvanceValid, mileageWarningMessage } from "./vehicleMaintenance";

describe("calculateOilMaintenance", () => {
  it("calculates remaining mileage from the last oil reading", () => {
    expect(calculateOilMaintenance({ currentMileage: 82_000, lastOilChangeMileage: 79_000, oilChangeInterval: 5_000 })).toMatchObject({ travelled: 3_000, remaining: 2_000, due: false, dueByMileage: false, dueByTime: false });
  });

  it("marks service due without returning a negative distance", () => {
    expect(calculateOilMaintenance({ currentMileage: 85_200, lastOilChangeMileage: 80_000, oilChangeInterval: 5_000 })).toMatchObject({ travelled: 5_200, remaining: 0, due: true, dueByMileage: true });
  });

  it("marks service due after forty days even when mileage is below the interval", () => {
    const now = new Date("2026-09-10T00:00:00Z");
    const result = calculateOilMaintenance({ currentMileage: 82_000, lastOilChangeMileage: 80_000, oilChangeInterval: 5_000, lastOilChangeDate: "2026-07-31", now });
    expect(result.due).toBe(true);
    expect(result.dueByTime).toBe(true);
    expect(mileageWarningMessage(result)).toContain("40");
  });

  it("keeps maintenance unknown when no previous oil reading exists", () => {
    expect(calculateOilMaintenance({ currentMileage: 20_000, lastOilChangeMileage: null, oilChangeInterval: 5_000 })).toMatchObject({ travelled: null, remaining: null, due: false });
  });

  it("calculates extra mileage at half a riyal per kilometre", () => {
    expect(calculateExtraMileageCharge({ currentMileage: 1_420, startingMileage: 1_000, allowedMileage: 300 })).toEqual({ consumed: 420, extraMileage: 120, charge: 60 });
  });

  it("applies the requested grace periods", () => {
    expect(getContractGraceHours({ type: "daily", contractScope: "domestic_limited", days: 3 })).toBe(2);
    expect(getContractGraceHours({ type: "daily", contractScope: "domestic_open", days: 10 })).toBe(4);
    expect(getContractGraceHours({ type: "monthly", contractScope: "domestic_open", days: 30 })).toBe(12);
  });

  it("accepts equal or higher odometer readings and rejects rollback", () => {
    expect(isMileageAdvanceValid(80_000, 80_000)).toBe(true);
    expect(isMileageAdvanceValid(80_000, 80_250)).toBe(true);
    expect(isMileageAdvanceValid(80_000, 79_999)).toBe(false);
  });
});
