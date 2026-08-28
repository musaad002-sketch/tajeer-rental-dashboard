import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const testContext = {
  user: { id: 1, openId: "integration-test", name: "Integration Test", email: null, loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "http", headers: {} },
  res: {},
} as TrpcContext;

describe("contracts.details integration", () => {
  it.skipIf(!process.env.DATABASE_URL)("loads a real contract and its persisted payments and operations", async () => {
    const caller = appRouter.createCaller(testContext);
    const contracts = await caller.contracts.list();
    expect(Array.isArray(contracts)).toBe(true);
    if (contracts.length === 0) return;

    const selected = contracts[0];
    const details = await caller.contracts.details({ id: selected.contract.id });
    expect(details?.contract.id).toBe(selected.contract.id);
    expect(Array.isArray(details?.payments)).toBe(true);
    expect(Array.isArray(details?.operations)).toBe(true);
    if (details?.customer && selected.customer) expect(details.customer.id).toBe(selected.customer.id);
    if (details?.vehicle && selected.vehicle) expect(details.vehicle.id).toBe(selected.vehicle.id);
  }, 15000);
});
