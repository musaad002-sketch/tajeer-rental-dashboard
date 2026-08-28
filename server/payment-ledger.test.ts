import { describe, expect, it, vi } from "vitest";

const mockPayments = vi.hoisted(() => vi.fn(async () => [{
  payment: { id: 19, contractId: 4, customerId: 8, amount: "450.00", method: "network", notes: "دفعة عبر جهاز الشبكة", createdAt: new Date("2026-08-28T13:45:00Z") },
  contract: { id: 4, contractNumber: "1058" },
  customer: { id: 8, fullName: "خالد محمد" },
}]));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, listPayments: mockPayments };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = { user: { id: 1, openId: "accounting-user", name: "محاسب", email: null, loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "http", headers: {} }, res: {} } as TrpcContext;

describe("payment ledger API", () => {
  it("exposes the full payment detail needed by accounting and revenue screens", async () => {
    const rows = await appRouter.createCaller(context).payments.list();
    expect(rows).toEqual([{ payment: expect.objectContaining({ amount: "450.00", method: "network", notes: "دفعة عبر جهاز الشبكة" }), contract: expect.objectContaining({ contractNumber: "1058" }), customer: expect.objectContaining({ fullName: "خالد محمد" }) }]);
  });
});
