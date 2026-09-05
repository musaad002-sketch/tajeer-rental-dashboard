import { describe, expect, it } from "vitest";
import { formatContractRows } from "./contractView";

describe("formatContractRows", () => {
  it("renders the saved contract status and outstanding amount", () => {
    const [row] = formatContractRows([{
      contract: { contractNumber: "1031", expectedReturnDate: "2026-08-30", status: "closed", totalAmount: "300", paidAmount: "125" },
      customer: { fullName: "عميل اختبار" },
      vehicle: { make: "تويوتا", model: "كامري" },
    }]);
    expect(row).toMatchObject({ id: "#1031", customer: "عميل اختبار", car: "تويوتا كامري", status: "مغلق", tone: "amber" });
    expect(row?.due).toContain("175");
    expect(row?.delayDays).toBeGreaterThanOrEqual(0);
    expect(row?.previousOutstanding).toBeDefined();
    expect(row?.currentOutstanding).toBeDefined();
    expect(row?.grandOutstanding).toBeDefined();
  });
});
