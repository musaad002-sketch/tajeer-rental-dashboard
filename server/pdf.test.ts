import { describe, expect, it } from "vitest";
import { formatReceiptData, generateContractPdf, generateReceiptPdf } from "./pdf";

describe("PDF documents", () => {
  it("maps a persisted payment row to receipt data", () => {
    const data = formatReceiptData({ payment: { id: 42, amount: "125.00", method: "network", notes: "دفعة حقيقية", createdAt: new Date("2026-08-27T15:00:00Z") }, contract: { contractNumber: "1031" }, customer: { fullName: "عميل اختبار" } });
    expect(data).toMatchObject({ receiptNumber: 42, contractNumber: "1031", customerName: "عميل اختبار", amount: "125.00", paymentMethod: "network", details: "دفعة حقيقية" });
  });
  it("generates a rental contract PDF", async () => {
    const bytes = await generateContractPdf({ contractNumber: "SMOKE-1031", customerName: "عميل اختبار", identityNumber: "123", vehicleMake: "تويوتا", vehicleModel: "كامري", plateNumber: "أ ب ج 123", startDate: "2026-08-27", expectedReturnDate: "2026-08-30", totalAmount: "300", paidAmount: "125" });
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("generates a payment receipt PDF", async () => {
    const bytes = await generateReceiptPdf({ receiptNumber: 42, contractNumber: "SMOKE-1031", customerName: "عميل اختبار", amount: "125.00", paymentMethod: "network", createdAt: new Date("2026-08-27T15:00:00Z"), details: "دفعة حقيقية مرتبطة بالعقد" });
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
