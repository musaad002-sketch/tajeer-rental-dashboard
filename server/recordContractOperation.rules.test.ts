import { describe, expect, it, vi } from "vitest";

const { fakeDb } = vi.hoisted(() => ({ fakeDb: { select: vi.fn(), update: vi.fn(() => { const chain: any = { set: vi.fn(), where: vi.fn() }; chain.set.mockReturnValue(chain); chain.where.mockResolvedValue([]); return chain; }) } }));

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));

import { recordContractOperation } from "./db";

function selectChain<T>(result: T) {
  const chain: any = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  return chain;
}

describe("recordContractOperation guardrails", () => {
  it("rejects suspension when payments cover accrued rent", async () => {
    process.env.DATABASE_URL = "mysql://test";
    fakeDb.select.mockReset();
    fakeDb.select.mockImplementation(() => selectChain([{
      id: 701,
      customerId: 9,
      vehicleId: 12,
      startDate: new Date(),
      rentalAmount: "3000.00",
      type: "monthly",
      paidAmount: "3000.00",
    }]));

    await expect(recordContractOperation({ contractNumber: "1701", operation: "suspend", vehicleMileage: 12000 })).rejects.toThrow("لا يمكن تعليق العقد");
  });

  it("rejects close when the visible contract number is not stored", async () => {
    process.env.DATABASE_URL = "mysql://test";
    fakeDb.select.mockReset();
    fakeDb.select.mockImplementation(() => selectChain([]));

    await expect(recordContractOperation({ contractNumber: "__NOT_REGISTERED_CLOSE__", operation: "close" })).rejects.toThrow("العقد غير موجود في قاعدة البيانات");
  });

  it.each(["payment", "extension", "vehicle_swap", "suspend", "close", "return"] as const)("rejects %s after the contract has been returned", async (operation) => {
    process.env.DATABASE_URL = "mysql://test";
    fakeDb.select.mockReset();
    fakeDb.select.mockImplementation(() => selectChain([{
      id: 702,
      customerId: 9,
      vehicleId: 12,
      status: "returned",
      startDate: new Date(),
      expectedReturnDate: new Date(),
      rentalAmount: "300.00",
      totalAmount: "300.00",
      paidAmount: "300.00",
      type: "daily",
    }]));

    await expect(recordContractOperation({ contractNumber: "1702", operation })).rejects.toThrow("تم استرجاع العقد وإغلاقه نهائياً");
  });
});


  it.each(["close", "return"] as const)("rejects %s when the contract has unpaid balance", async (operation) => {
    process.env.DATABASE_URL = "mysql://test";
    fakeDb.select.mockReset();
    fakeDb.select.mockImplementation(() => selectChain([{
      id: 703,
      customerId: 9,
      vehicleId: 12,
      mileage: 0,
      status: "active",
      startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      expectedReturnDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      rentalAmount: "300.00",
      totalAmount: "1200.00",
      paidAmount: "0.00",
      type: "daily",
    }]));

    await expect(recordContractOperation({ contractNumber: "1703", operation, vehicleMileage: 999999 })).rejects.toThrow(/يوجد مبلغ غير مسدد/);
  });


  it("rejects extension when arrears are not fully paid", async () => {
    process.env.DATABASE_URL = "mysql://test";
    fakeDb.select.mockReset();
    fakeDb.select.mockImplementation(() => selectChain([{
      id: 704,
      customerId: 9,
      vehicleId: 12,
      status: "overdue",
      startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      expectedReturnDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      rentalAmount: "300.00",
      totalAmount: "3000.00",
      paidAmount: "0.00",
      type: "daily",
    }]));

    await expect(recordContractOperation({ contractNumber: "1704", operation: "extension", extensionDays: 3, extensionPaymentAmount: "100.00", extensionPaymentMethod: "cash" })).rejects.toThrow(/لا يمكن تمديد العقد قبل سداد المتأخرات/);
  });
