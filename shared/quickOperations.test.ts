import { describe, expect, it } from "vitest";
import { quickOperationLabels, quickOperationMap } from "./quickOperations";

describe("quick operations", () => {
  it("contains only the five operations approved for the dashboard", () => {
    expect(quickOperationLabels).toEqual(["استلام مبلغ", "تمديد عقد", "تبديل سيارة", "إغلاق عقد", "استرجاع سيارة"]);
    expect(Object.values(quickOperationMap)).toEqual(["payment", "extension", "vehicle_swap", "close", "return"]);
  });
});
