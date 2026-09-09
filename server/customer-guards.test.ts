import { describe, expect, it, vi } from "vitest";

const { fakeDb } = vi.hoisted(() => ({
  fakeDb: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));

import { createContract, createCustomer } from "./db";

function selectChain<T>(result: T) {
  const chain: any = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  return chain;
}

describe("customer duplicate and blocked guards", () => {
  it("rejects a duplicate identity or phone before inserting", async () => {
    process.env.DATABASE_URL = "mysql://test";
    fakeDb.select.mockReset();
    fakeDb.insert.mockReset();
    fakeDb.select.mockImplementationOnce(() => selectChain([{ id: 10, fullName: "عميل سابق" }]));

    await expect(createCustomer({ identityNumber: "123", fullName: "عميل جديد", phone: "0500000000" })).rejects.toThrow("العميل مسجل مسبقاً");
    expect(fakeDb.insert).not.toHaveBeenCalled();
  });

  it("rejects a new customer whose identity is actively blocked", async () => {
    process.env.DATABASE_URL = "mysql://test";
    fakeDb.select.mockReset();
    fakeDb.insert.mockReset();
    fakeDb.select
      .mockImplementationOnce(() => selectChain([]))
      .mockImplementationOnce(() => selectChain([{ id: 20, fullName: "محظور", reason: "تعثر متكرر" }]));

    await expect(createCustomer({ identityNumber: "456", fullName: "عميل محظور", phone: "0511111111" })).rejects.toThrow("لا يمكن تسجيل العميل لأنه محظور");
    expect(fakeDb.insert).not.toHaveBeenCalled();
  });

  it("rejects a contract for an existing customer whose block is active", async () => {
    process.env.DATABASE_URL = "mysql://test";
    fakeDb.select.mockReset();
    fakeDb.insert.mockReset();
    fakeDb.select
      .mockImplementationOnce(() => selectChain([{ id: 7, identityNumber: "789", phone: "0522222222", phoneSecondary: null }]))
      .mockImplementationOnce(() => selectChain([{ id: 30, reason: "ملاحظة إدارية" }]));

    await expect(createContract({ customerId: 7, vehicleId: 12, type: "daily", startDate: "2026-09-09", expectedReturnDate: "2026-09-10", rentalAmount: "100", days: 1, totalAmount: "100" })).rejects.toThrow("لا يمكن إنشاء عقد لهذا العميل لأنه محظور");
    expect(fakeDb.insert).not.toHaveBeenCalled();
  });
});
