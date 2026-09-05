import { describe, expect, it } from "vitest";
import { contractOperationOptions, uniqueContractOperationOptions } from "./contractOperationOptions";

describe("contract operation catalog", () => {
  it("contains one visible option per operation value", () => {
    const values = uniqueContractOperationOptions().map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).not.toContain("additional_fee");
    expect(values).toEqual(contractOperationOptions.map((option) => option.value));
  });
});
