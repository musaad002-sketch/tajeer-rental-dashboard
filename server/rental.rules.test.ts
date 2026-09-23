import { describe, expect, it } from "vitest";
import {
  getOperatingCycle,
  hasRentalPeriodOverlap,
  isContractOverdue,
  isValidRentalPeriod,
  isVehicleAvailable,
} from "@shared/rentalRules";

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

describe("datetime rental period overlap", () => {
  const existingStart = new Date("2026-09-17T10:00:00.000Z");
  const existingEnd = new Date("2026-09-17T12:00:00.000Z");

  it("requires a strictly positive period", () => {
    expect(isValidRentalPeriod(existingStart, existingEnd)).toBe(true);
    expect(isValidRentalPeriod(existingStart, existingStart)).toBe(false);
    expect(isValidRentalPeriod(existingEnd, existingStart)).toBe(false);
  });

  it("allows exact adjacent periods", () => {
    expect(
      hasRentalPeriodOverlap(
        existingStart,
        existingEnd,
        existingEnd,
        new Date("2026-09-17T14:00:00.000Z")
      )
    ).toBe(false);
    expect(
      hasRentalPeriodOverlap(
        existingStart,
        existingEnd,
        new Date("2026-09-17T08:00:00.000Z"),
        existingStart
      )
    ).toBe(false);
  });

  it("rejects one-minute and nested overlaps", () => {
    expect(
      hasRentalPeriodOverlap(
        existingStart,
        existingEnd,
        new Date("2026-09-17T11:59:00.000Z"),
        new Date("2026-09-17T14:00:00.000Z")
      )
    ).toBe(true);
    expect(
      hasRentalPeriodOverlap(
        existingStart,
        existingEnd,
        new Date("2026-09-17T10:30:00.000Z"),
        new Date("2026-09-17T11:30:00.000Z")
      )
    ).toBe(true);
    expect(
      hasRentalPeriodOverlap(
        existingStart,
        existingEnd,
        new Date("2026-09-17T09:00:00.000Z"),
        new Date("2026-09-17T13:00:00.000Z")
      )
    ).toBe(true);
  });

  it("rejects equal periods and allows periods before or after", () => {
    expect(
      hasRentalPeriodOverlap(existingStart, existingEnd, existingStart, existingEnd)
    ).toBe(true);
    expect(
      hasRentalPeriodOverlap(
        existingStart,
        existingEnd,
        new Date("2026-09-17T06:00:00.000Z"),
        new Date("2026-09-17T08:00:00.000Z")
      )
    ).toBe(false);
    expect(
      hasRentalPeriodOverlap(
        existingStart,
        existingEnd,
        new Date("2026-09-17T14:00:00.000Z"),
        new Date("2026-09-17T16:00:00.000Z")
      )
    ).toBe(false);
  });
});
