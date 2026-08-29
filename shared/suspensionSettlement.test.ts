import { describe, expect, it } from "vitest";
import { statusAfterSuspendedSettlement } from "./suspensionSettlement";

describe("statusAfterSuspendedSettlement", () => {
  it("يعيد تفعيل العقد المعلق عند تسوية الرصيد قبل التسليم", () => {
    expect(statusAfterSuspendedSettlement({ status: "suspended", outstanding: "0.00", expectedReturnDate: "2026-09-10", now: new Date("2026-09-01") })).toBe("active");
  });

  it("يعيد العقد متأخراً عند تسوية الرصيد بعد التسليم ولا ينقل العقد ذي الرصيد المتبقي", () => {
    expect(statusAfterSuspendedSettlement({ status: "suspended", outstanding: "0.00", expectedReturnDate: "2026-08-20", now: new Date("2026-08-25") })).toBe("overdue");
    expect(statusAfterSuspendedSettlement({ status: "suspended", outstanding: "1.00", expectedReturnDate: "2026-09-10" })).toBeNull();
  });
});
