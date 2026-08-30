import { describe, expect, it } from "vitest";
import { isExpenseIncludedInNetRevenue } from "./expenseApproval";

describe("expense approval policy", () => {
  it("includes only manager-approved expenses", () => {
    expect(isExpenseIncludedInNetRevenue("approved")).toBe(true);
    expect(isExpenseIncludedInNetRevenue("pending")).toBe(false);
    expect(isExpenseIncludedInNetRevenue("rejected")).toBe(false);
  });
});
