import { describe, expect, it } from "vitest";
import { isValidVehicleModelYear } from "./vehicleRules";

describe("قواعد سنة السيارة", () => {
  it("تقبل سنة تاريخية موجودة في بيانات المكتب مثل 1923", () => {
    expect(isValidVehicleModelYear(1923)).toBe(true);
  });

  it("ترفض السنة غير الصحيحة أو المستقبلية البعيدة", () => {
    expect(isValidVehicleModelYear(0)).toBe(false);
    expect(isValidVehicleModelYear(2101)).toBe(false);
    expect(isValidVehicleModelYear(2024.5)).toBe(false);
  });
});
