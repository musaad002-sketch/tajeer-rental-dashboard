import { describe, expect, it, vi } from "vitest";

const { fakeDb, payMock, selectedLiability } = vi.hoisted(() => {
  const selectedLiability = { current: null as Record<string, unknown> | null };
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    limit: vi.fn(async () =>
      selectedLiability.current ? [selectedLiability.current] : []
    ),
  };
  const fakeDb = {
    select: vi.fn(() => query),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  };
  return { fakeDb, payMock: vi.fn(async () => undefined), selectedLiability };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, recordOfficeLiabilityPayment: payMock };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const actualDb = await vi.importActual<typeof import("./db")>("./db");

const context = { user: { id: 7, openId: "local_admin", name: "مدير النظام", email: null, loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "http", headers: {} }, res: {} } as TrpcContext;

describe("liabilities.pay", () => {
  it("passes the selected cash, network, or transfer method to persistence", async () => {
    payMock.mockClear();
    const caller = appRouter.createCaller(context);
    await caller.liabilities.pay({ id: 12, amount: "250", paymentMethod: "network" });
    expect(payMock).toHaveBeenCalledWith(12, "250", "network", 7);
  });

  it.each(["pending", "rejected"] as const)(
    "rejects payment for a %s liability",
    async approvalStatus => {
      process.env.DATABASE_URL = "mysql://test";
      selectedLiability.current = {
        id: 12,
        amount: "250.00",
        paidAmount: "0.00",
        approvalStatus,
      };

      await expect(
        actualDb.recordOfficeLiabilityPayment(12, "250", "cash", 7)
      ).rejects.toThrow(
        `لا يمكن سداد التزام غير معتمد. الحالة الحالية: ${approvalStatus}`
      );
      expect(fakeDb.update).not.toHaveBeenCalled();
    }
  );

  it("allows payment for an approved liability", async () => {
    process.env.DATABASE_URL = "mysql://test";
    selectedLiability.current = {
      id: 12,
      amount: "250.00",
      paidAmount: "0.00",
      approvalStatus: "approved",
    };

    await expect(
      actualDb.recordOfficeLiabilityPayment(12, "250", "cash", 7)
    ).resolves.toEqual({
      success: true,
      paidAmount: "250.00",
      status: "paid",
    });
    expect(fakeDb.update).toHaveBeenCalledTimes(1);
  });
});
