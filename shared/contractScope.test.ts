import { describe, expect, it } from "vitest";
import { canChargeMonthlyAuthorizationFee, contractScopeOptions, isInternationalContract, requiresInternationalAuthorizationFee } from "./contractScope";

describe("contract scope policy", () => {
  it("exposes the three requested contract scopes", () => {
    expect(contractScopeOptions.map((option) => option.value)).toEqual(["domestic_limited", "domestic_open", "international"]);
    expect(contractScopeOptions[0].kilometerPolicy).toBe("150 كم يومياً");
    expect(contractScopeOptions[1].kilometerPolicy).toBe("عداد مفتوح");
  });

  it("allows authorization fees only for international contracts", () => {
    expect(isInternationalContract("international")).toBe(true);
    expect(requiresInternationalAuthorizationFee("domestic_open")).toBe(false);
    expect(requiresInternationalAuthorizationFee("international")).toBe(true);
    expect(canChargeMonthlyAuthorizationFee("domestic_open", "monthly", false)).toBe(false);
  });

  it("allows one monthly authorization fee and permits a new fee after the month check is clear", () => {
    expect(canChargeMonthlyAuthorizationFee("international", "monthly", false)).toBe(true);
    expect(canChargeMonthlyAuthorizationFee("international", "monthly", true)).toBe(false);
    expect(canChargeMonthlyAuthorizationFee("international", "daily", true)).toBe(true);
  });
});
