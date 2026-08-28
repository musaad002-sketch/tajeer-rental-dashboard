import { describe, expect, it } from "vitest";
import { nextContractNumber } from "./contractNumbers";

describe("contract number generation", () => {
  it("increments the greatest numeric visible contract number", () => {
    expect(nextContractNumber(["1001", " 1011 ", "legacy", null])).toBe("1012");
  });

  it("starts above the protected baseline when no usable number exists", () => {
    expect(nextContractNumber(["legacy", "", undefined])).toBe("1001");
  });
});
