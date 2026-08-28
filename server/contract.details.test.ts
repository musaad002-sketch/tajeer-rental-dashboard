import { describe, expect, it, vi } from "vitest";

const { fakeDb } = vi.hoisted(() => ({ fakeDb: { select: vi.fn() } }));

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));

import { getContractDetails } from "./db";

function selectChain<T>(result: T) {
  const chain: any = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
  };
  for (const method of ["from", "leftJoin", "where"]) chain[method].mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  chain.orderBy.mockResolvedValue(result);
  return chain;
}

describe("contracts.details", () => {
  it("returns the selected contract with its real payment and operation collections", async () => {
    process.env.DATABASE_URL = "mysql://test";
    const contract = { id: 42, contractNumber: "1024", totalAmount: "1200.00", paidAmount: "300.00" };
    const payment = { id: 7, contractId: 42, customerId: 9, amount: "300.00", method: "cash" };
    const operation = { id: 11, contractId: 42, operation: "payment", amount: "300.00" };
    fakeDb.select.mockReset();
    fakeDb.select
      .mockImplementationOnce(() => selectChain([{ contract, customer: { fullName: "أحمد محمد" }, vehicle: { make: "تويوتا", model: "كامري" } }]))
      .mockImplementationOnce(() => selectChain([payment]))
      .mockImplementationOnce(() => selectChain([operation]))
      .mockImplementationOnce(() => selectChain([]))
      .mockImplementationOnce(() => selectChain([]));

    const result = await getContractDetails(42);

    expect(result?.contract).toEqual(contract);
    expect(result?.customer?.fullName).toBe("أحمد محمد");
    expect(result?.vehicle?.model).toBe("كامري");
    expect(result?.payments).toEqual([payment]);
    expect(result?.operations).toHaveLength(1);
    expect(result?.operations[0]).toEqual(expect.objectContaining(operation));
    expect(result?.operations[0]?.createdByName).toBe("—");
  });
});
