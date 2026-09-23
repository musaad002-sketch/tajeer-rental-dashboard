import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const { allocateMock } = vi.hoisted(() => ({ allocateMock: vi.fn(async (transactionId: number) => ({ transactionId, allocations: [], totalAllocated: "0.00" })) }));
vi.mock("./paymentAllocation", () => ({ allocateApprovedPayment: allocateMock }));

const context = (role: "user" | "admin"): TrpcContext => ({
  user: { id: role === "admin" ? 9 : 7, openId: role, name: role, email: null, loginMethod: "local", role, isActive: true, permissions: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "http", headers: {} },
  res: {},
} as TrpcContext);

describe("paymentAllocation API", () => {
  it("only permits the manager approval procedure to allocate", async () => {
    await expect(appRouter.createCaller(context("user")).paymentAllocation.allocate({ transactionId: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    allocateMock.mockClear();
    await appRouter.createCaller(context("admin")).paymentAllocation.allocate({ transactionId: 10, asOf: "2026-09-14T00:00:00.000Z" });
    expect(allocateMock).toHaveBeenCalledWith(10, new Date("2026-09-14T00:00:00.000Z"));
  });
});
