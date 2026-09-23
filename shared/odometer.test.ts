import { describe, expect, it } from "vitest";
import { calculateOdometerDistance, latestDocumentedOdometer, requiresOdometerReading, validateOdometerReading } from "./odometer";

describe("odometer rules", () => {
  it("accepts a valid reading and reports the distance from the latest source", () => {
    expect(validateOdometerReading({ reading: 12_500, documentedReadings: [{ source: "vehicle", reading: 12_000 }, { source: "maintenance", reading: 12_300 }, { source: "oil_change", reading: 12_400 }] })).toEqual({ reading: 12_500, previousReading: 12_400, difference: 100, corrected: false });
  });

  it("uses the greatest documented reading across vehicle, maintenance, oil, and contracts", () => {
    expect(latestDocumentedOdometer([
      { source: "vehicle", reading: 9_500 },
      { source: "maintenance", reading: 9_800 },
      { source: "oil_change", reading: 9_700 },
      { source: "contract", reading: 9_900 },
      { source: "return", reading: null },
    ])).toBe(9_900);
  });

  it.each([
    ["vehicle", 12_000],
    ["maintenance", 12_500],
    ["oil_change", 12_700],
    ["contract", 12_900],
  ] as const)("uses the highest documented %s reading", (source, reading) => {
    expect(latestDocumentedOdometer([
      { source, reading },
      { source: "vehicle", reading: 11_000 },
    ])).toBe(reading);
  });

  it("rejects a missing reading and a negative reading", () => {
    expect(() => validateOdometerReading({ reading: undefined, documentedReadings: [] })).toThrow("يجب إدخال قراءة العداد");
    expect(() => validateOdometerReading({ reading: -1, documentedReadings: [] })).toThrow("غير سالب");
  });

  it("rejects a lower reading unless a documented correction reason is supplied", () => {
    expect(() => validateOdometerReading({ reading: 9_000, documentedReadings: [{ source: "vehicle", reading: 9_500 }] })).toThrow("سبب تصحيح موثق");
    expect(validateOdometerReading({ reading: 9_000, documentedReadings: [{ source: "vehicle", reading: 9_500 }], correctionReason: "استبدال لوحة العداد موثق بمحضر" })).toMatchObject({ previousReading: 9_500, difference: -500, corrected: true });
  });

  it("requires readings for contract creation and lifecycle operations", () => {
    for (const operation of ["new_contract", "close", "vehicle_swap", "return", "suspend"]) expect(requiresOdometerReading(operation)).toBe(true);
    expect(requiresOdometerReading("payment")).toBe(false);
    for (const operation of ["new_contract", "close", "vehicle_swap", "return", "suspend"]) {
      expect(() => validateOdometerReading({ reading: undefined, documentedReadings: [{ source: "vehicle", reading: 100 }] })).toThrow("يجب إدخال قراءة العداد");
      expect(requiresOdometerReading(operation)).toBe(true);
    }
  });

  it("calculates distance from start and end readings", () => {
    expect(calculateOdometerDistance(10_000, 10_450)).toBe(450);
    expect(() => calculateOdometerDistance(10_450, 10_000)).toThrow("غير صالحة");
  });
});
