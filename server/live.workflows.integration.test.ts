import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const testContext = {
  user: { id: 1, openId: "integration-test", name: "Integration Test", email: null, loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "http", headers: {} },
  res: {},
} as TrpcContext;

describe("live workflow integrations", () => {
  it.skipIf(!process.env.DATABASE_URL)("returns only vehicles eligible for a new rental", async () => {
    const caller = appRouter.createCaller(testContext);
    const available = await caller.vehicles.available();
    const activeContracts = await caller.contracts.list({ status: "active" });
    const overdueContracts = await caller.contracts.list({ status: "overdue" });
    const blockedVehicleIds = new Set([
      ...activeContracts.map((row) => row.vehicle?.id),
      ...overdueContracts.map((row) => row.vehicle?.id),
    ].filter((id): id is number => typeof id === "number"));

    expect(available.every((vehicle) => vehicle.status === "available")).toBe(true);
    expect(available.every((vehicle) => !blockedVehicleIds.has(vehicle.id))).toBe(true);
    expect(new Set(available.map((vehicle) => vehicle.id)).size).toBe(available.length);
  }, 15000);

  it.skipIf(!process.env.DATABASE_URL)("rejects a visible contract number that is not stored", async () => {
    const caller = appRouter.createCaller(testContext);
    await expect(caller.operations.record({ contractNumber: "__NOT_REGISTERED_CONTRACT__", operation: "payment", amount: "1" })).rejects.toThrow("العقد غير موجود في قاعدة البيانات");
  }, 15000);

  it.skipIf(!process.env.DATABASE_URL)("returns separated vehicle revenue totals and monthly collections", async () => {
    const caller = appRouter.createCaller(testContext);
    const report = await caller.reports.vehicleRevenue();
    expect(report.totals).toEqual(expect.objectContaining({ contractValue: expect.any(String), collected: expect.any(String), otherRevenue: expect.any(String), cash: expect.any(String), network: expect.any(String), outstanding: expect.any(String), excludedOutstanding: expect.any(String), expenses: expect.any(String), netRevenue: expect.any(String) }));
    expect(report.vehicles.every((row) => typeof row.vehicleId === "number" && Array.isArray(row.months))).toBe(true);
    expect(report.vehicles.every((row) => Number(row.collected) >= 0 && Number(row.cash) >= 0 && Number(row.network) >= 0 && Number(row.outstanding) >= 0)).toBe(true);
  }, 15000);

  it.skipIf(!process.env.DATABASE_URL)("exposes separate payment and return ledgers", async () => {
    const caller = appRouter.createCaller(testContext);
    const [payments, returns] = await Promise.all([caller.payments.list(), caller.returns.list()]);
    expect(Array.isArray(payments)).toBe(true);
    expect(Array.isArray(returns)).toBe(true);
    expect(payments.every((row) => typeof row.payment.id === "number" && (!row.contract || typeof row.contract.contractNumber === "string"))).toBe(true);
    expect(returns.every((row) => row.operation.operation === "return" && typeof row.contract.contractNumber === "string")).toBe(true);
  }, 15000);

  it.skipIf(!process.env.DATABASE_URL)("returns a non-duplicated customer ledger for a real customer query", async () => {
    const caller = appRouter.createCaller(testContext);
    const customers = await caller.customers.list();
    if (!customers[0]) return;
    const ledger = await caller.customers.ledger({ query: customers[0].identityNumber });
    expect(Array.isArray(ledger)).toBe(true);
    const keys = ledger.map((row) => `${row.contract?.id ?? "none"}:${row.payment?.id ?? "none"}:${row.operation?.id ?? "none"}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(ledger.every((row) => row.customer?.id === customers[0].id)).toBe(true);
  }, 15000);

  it.skipIf(!process.env.DATABASE_URL)("reads office liabilities separately from customer accounting", async () => {
    const caller = appRouter.createCaller(testContext);
    const [rows, summary] = await Promise.all([caller.liabilities.list(), caller.liabilities.summary()]);
    expect(Array.isArray(rows)).toBe(true);
    expect(summary).toEqual(expect.objectContaining({ total: expect.any(String), paid: expect.any(String), outstanding: expect.any(String), count: expect.any(Number) }));
    expect(Number(summary.outstanding)).toBeGreaterThanOrEqual(0);
  }, 15000);
});


  it.skipIf(!process.env.DATABASE_URL)("includes the paid amount of retroactively settled contract 1002 in vehicle revenue", async () => {
    const caller = appRouter.createCaller(testContext);
    const contracts = await caller.contracts.list();
    const target = contracts.find((row) => row.contract.contractNumber === "1002");
    if (!target || !target.vehicle) return;
    const report = await caller.reports.vehicleRevenue();
    const vehicleRow = report.vehicles.find((row) => row.vehicleId === target.vehicle?.id);
    expect(vehicleRow).toBeDefined();
    const rentalRevenue = Number(vehicleRow?.collected ?? 0);
    const otherRevenue = Number(vehicleRow?.otherRevenue ?? 0);
    expect(rentalRevenue).toBe(2500);
    expect(otherRevenue).toBe(5175);
    expect(rentalRevenue + otherRevenue).toBe(Number(target.contract.paidAmount));
  }, 15000);
