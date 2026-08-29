import { describe, expect, it } from "vitest";
import { belongsToGeneralOutstanding, sumOutstandingByStatus } from "./outstandingStatus";

describe("outstandingStatus", () => {
  it("يقصر المستحقات العامة على العقود السارية والمتأخرة", () => {
    expect(belongsToGeneralOutstanding("active")).toBe(true);
    expect(belongsToGeneralOutstanding("overdue")).toBe(true);
    expect(belongsToGeneralOutstanding("suspended")).toBe(false);
  });

  it("يحسب رصيد العقود المعلقة بصورة منفصلة", () => {
    expect(sumOutstandingByStatus([{ status: "suspended" as const, outstanding: 220 }, { status: "suspended" as const, outstanding: 80 }, { status: "active" as const, outstanding: 500 }], "suspended")).toBe(300);
  });
});
