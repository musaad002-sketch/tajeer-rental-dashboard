import { describe, expect, it, vi } from "vitest";

const { payMock } = vi.hoisted(() => ({ payMock: vi.fn(async () => undefined) }));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, recordOfficeLiabilityPayment: payMock };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = { user: { id: 7, openId: "local_admin", name: "مدير النظام", email: null, loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "http", headers: {} }, res: {} } as TrpcContext;

describe("liabilities.pay", () => {
  it("passes the selected cash, network, or transfer method to persistence", async () => {
    payMock.mockClear();
    const caller = appRouter.createCaller(context);
    await caller.liabilities.pay({ id: 12, amount: "250", paymentMethod: "network" });
    expect(payMock).toHaveBeenCalledWith(12, "250", "network", 7);
  });
});
