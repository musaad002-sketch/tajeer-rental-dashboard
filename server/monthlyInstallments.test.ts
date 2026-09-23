import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  installments: [] as Array<Record<string, unknown>>,
  nextId: 1,
}));

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: vi.fn(() => {
    const db: any = {
      select: vi.fn(() => {
        const chain: any = {
          from: vi.fn(table => {
            chain.table = table;
            return chain;
          }),
          where: vi.fn(() => chain),
          orderBy: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          then: (resolve: (value: unknown) => unknown) => {
            const rows = chain.table === monthlyInstallments
              ? state.installments
              : [];
            return Promise.resolve(rows).then(resolve);
          },
        };
        return chain;
      }),
      insert: vi.fn(() => {
        const chain: any = {
          values: vi.fn(rows => {
            for (const row of Array.isArray(rows) ? rows : [rows]) {
              if (!state.installments.some(item => item.contractId === row.contractId && item.monthNumber === row.monthNumber)) {
                state.installments.push({ id: state.nextId++, paidAmount: "0", status: "unpaid", ...row });
              }
            }
            return chain;
          }),
          onDuplicateKeyUpdate: vi.fn(() => chain),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve({}).then(resolve),
        };
        return chain;
      }),
      update: vi.fn(() => {
        const chain: any = {
          set: vi.fn(values => { chain.values = values; return chain; }),
          where: vi.fn(() => {
            const target = state.installments.find(item => item.id === chain.id) ?? state.installments[0];
            if (target && chain.values) Object.assign(target, chain.values);
            return Promise.resolve([]);
          }),
        };
        return chain;
      }),
      transaction: vi.fn(async (callback: (transactionDb: any) => Promise<unknown>) => callback(db)),
    };
    return db;
  }),
}));

import {
  allocatePaymentToMonth,
  generateMonthlyInstallments,
  getMonthlyInstallments,
} from "./db";
import { monthlyInstallments } from "../drizzle/schema";

describe("monthly installments", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");

  beforeEach(() => {
    state.installments.length = 0;
    state.nextId = 1;
    process.env.DATABASE_URL = "mysql://test";
  });

  it("generates three installments for a three-month contract", async () => {
    const rows = await generateMonthlyInstallments(10, start, 3, "1200");
    expect(rows).toHaveLength(3);
    expect(rows.map(row => row.monthNumber)).toEqual([1, 2, 3]);
  });

  it("uses the monthly rate for every installment", async () => {
    const rows = await generateMonthlyInstallments(10, start, 3, "1200");
    expect(rows.map(row => row.amount)).toEqual(["1200.00", "1200.00", "1200.00"]);
  });

  it("is idempotent when generating the same contract again", async () => {
    await generateMonthlyInstallments(10, start, 3, "1200");
    const rows = await generateMonthlyInstallments(10, start, 3, "1200");
    expect(rows).toHaveLength(3);
  });

  it("increases paidAmount and changes unpaid to partially_paid", async () => {
    await generateMonthlyInstallments(10, start, 3, "1200");
    const row = await allocatePaymentToMonth(10, 1, 300);
    expect(row.paidAmount).toBe("300.00");
    expect(row.status).toBe("partially_paid");
  });

  it("changes partially_paid to fully_paid at the installment amount", async () => {
    await generateMonthlyInstallments(10, start, 3, "1200");
    await allocatePaymentToMonth(10, 1, 300);
    const row = await allocatePaymentToMonth(10, 1, 900);
    expect(row.paidAmount).toBe("1200.00");
    expect(row.status).toBe("fully_paid");
  });
});
