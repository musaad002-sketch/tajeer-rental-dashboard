import { describe, expect, it } from "vitest";
import { paymentReasonLabels, paymentReasonOptions } from "./paymentReasons";

describe("payment reason options", () => {
  it("contains the requested insurance, damage, and cleaning reasons", () => {
    expect(paymentReasonLabels.insurance_deductible).toBe("نسبة تحمل التأمين");
    expect(paymentReasonLabels.vehicle_damage_compensation).toBe("مبلغ تعويض لأضرار بالسيارة");
    expect(paymentReasonLabels.vehicle_cleaning_fee).toBe("مبلغ رسوم تنظيف السيارة");
    expect(paymentReasonOptions.some((option) => option.value === "international_authorization_fee" && option.internationalOnly)).toBe(true);
  });
});
