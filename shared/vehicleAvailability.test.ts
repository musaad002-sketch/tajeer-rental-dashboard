import { describe, expect, it } from "vitest";
import {
  getVehicleAvailabilityReason,
  isVehicleAvailableForPeriod,
  rentalPeriodsOverlap,
  validateRentalPeriod,
} from "./vehicleAvailability";

describe("vehicle availability periods", () => {
  it("rejects a real date overlap", () => {
    expect(
      rentalPeriodsOverlap(
        { startDate: "2026-09-10", endDate: "2026-09-15" },
        { startDate: "2026-09-14", endDate: "2026-09-18" }
      )
    ).toBe(true);
  });

  it("allows adjacent periods at the return boundary", () => {
    expect(
      rentalPeriodsOverlap(
        { startDate: "2026-09-15", endDate: "2026-09-20" },
        { startDate: "2026-09-10", endDate: "2026-09-15" }
      )
    ).toBe(false);
  });

  it("supports excluding the current rental during an edit", () => {
    const current = { startDate: "2026-09-10", endDate: "2026-09-15" };
    expect(
      isVehicleAvailableForPeriod({
        requested: current,
        activeRentals: [current],
        excludedRental: current,
      })
    ).toBe(true);
  });

  it("reports operational reasons before date conflicts", () => {
    const requested = { startDate: "2026-09-10", endDate: "2026-09-15" };
    expect(
      getVehicleAvailabilityReason({
        requested,
        vehicleState: "maintenance",
        activeRentals: [{ startDate: "2026-09-11", endDate: "2026-09-12" }],
      })
    ).toBe("vehicle_state");
    expect(
      getVehicleAvailabilityReason({
        requested,
        vehicleState: "available",
        openMaintenanceCount: 1,
      })
    ).toBe("maintenance");
    expect(
      getVehicleAvailabilityReason({
        requested,
        activeRentals: [{ startDate: "2026-09-11", endDate: "2026-09-12" }],
      })
    ).toBe("date_conflict");
  });

  it("rejects an end date that is not after the start date", () => {
    expect(() => validateRentalPeriod({ startDate: "2026-09-15", endDate: "2026-09-15" })).toThrow();
    expect(() => validateRentalPeriod({ startDate: "2026-09-16", endDate: "2026-09-15" })).toThrow();
  });
});
