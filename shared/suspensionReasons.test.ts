import { describe, expect, it } from "vitest";
import { suspensionReasonLabels, suspensionReasonOptions } from "./suspensionReasons";

describe("suspension reasons", () => {
  it("includes claim and financial suspension reasons", () => {
    const values = suspensionReasonOptions.map((option) => option.value);
    expect(values).toContain("insurance_deductible_claim");
    expect(values).toContain("vehicle_damage_claim");
    expect(values).toContain("vehicle_cleaning_fee");
    expect(values).toContain("financial_default");
    expect(suspensionReasonLabels.insurance_deductible_claim).toContain("نسبة تحمل");
  });
});
