import { beforeEach, describe, expect, it, vi } from "vitest";
import { vehicleReadiness, vehicles } from "../drizzle/schema";

const state = vi.hoisted(() => ({
  vehicles: [
    { id: 1, plateNumber: "ABC 101", make: "Toyota", model: "Camry", modelYear: 2024, status: "available" },
    { id: 2, plateNumber: "ABC 102", make: "Kia", model: "K5", modelYear: 2023, status: "available" },
  ] as Array<Record<string, unknown>>,
  readiness: [] as Array<Record<string, unknown>>,
  nextId: 1,
}));

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: vi.fn(() => {
    const db: any = {
      select: vi.fn(() => {
        const chain: any = {
          from: vi.fn(table => { chain.table = table; return chain; }),
          where: vi.fn(() => { chain.hasWhere = true; return chain; }),
          orderBy: vi.fn(() => { chain.hasOrder = true; return chain; }),
          limit: vi.fn(() => chain),
          then: (resolve: (value: unknown) => unknown) => {
            let rows = chain.table === vehicleReadiness ? state.readiness : state.vehicles;
            if (chain.table === vehicles && state.readiness.length && chain.hasWhere && chain.hasOrder) {
              rows = state.vehicles.filter(vehicle => state.readiness.find(row => row.vehicleId === vehicle.id)?.state === "ready");
            }
            return Promise.resolve(rows).then(resolve);
          },
        };
        return chain;
      }),
      insert: vi.fn(() => {
        const chain: any = {
          values: vi.fn(row => {
            const inserted = { id: state.nextId++, changedAt: new Date(), ...row };
            state.readiness.push(inserted);
            chain.inserted = inserted;
            return chain;
          }),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve({ 0: { insertId: chain.inserted.id } }).then(resolve),
        };
        return chain;
      }),
    };
    return db;
  }),
}));

import { getFleetReadiness, getVehicleReadiness, listAvailableVehicles, setVehicleReadiness } from "./db";

describe("vehicle readiness", () => {
  beforeEach(() => {
    state.readiness.length = 0;
    state.nextId = 1;
    process.env.DATABASE_URL = "mysql://test";
  });

  it("saves a new readiness row", async () => {
    const row = await setVehicleReadiness({ vehicleId: 1, state: "cleaning", changedBy: 7 });
    expect(row?.state).toBe("cleaning");
    expect(state.readiness).toHaveLength(1);
  });

  it("rejects blocked state without a reason", async () => {
    await expect(setVehicleReadiness({ vehicleId: 1, state: "blocked", changedBy: 7 })).rejects.toThrow("سبب منع السيارة مطلوب");
  });

  it("returns ready by default when no row exists", async () => {
    await expect(getVehicleReadiness(1)).resolves.toMatchObject({ vehicleId: 1, state: "ready" });
  });

  it("returns every vehicle with its latest readiness", async () => {
    state.readiness.push({ id: 1, vehicleId: 1, state: "qc", changedAt: new Date() });
    const fleet = await getFleetReadiness();
    expect(fleet).toHaveLength(2);
    expect(fleet.find(row => row.vehicle.id === 1)?.readiness.state).toBe("qc");
    expect(fleet.find(row => row.vehicle.id === 2)?.readiness.state).toBe("ready");
  });

  it("excludes vehicles whose latest readiness is not ready", async () => {
    state.readiness.push({ id: 1, vehicleId: 1, state: "blocked", changedAt: new Date() });
    const available = await listAvailableVehicles();
    expect(available.map(vehicle => vehicle.id)).not.toContain(1);
  });
});
