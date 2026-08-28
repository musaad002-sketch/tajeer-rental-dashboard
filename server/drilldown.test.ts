import { describe, expect, it, vi } from "vitest";

const { vehicleDetailsMock, customerDetailsMock } = vi.hoisted(() => ({
  vehicleDetailsMock: vi.fn(async (id: number) => ({ vehicle: { id, plateNumber: "GXR 8918" }, contracts: [], maintenance: [] })),
  customerDetailsMock: vi.fn(async (id: number) => ({ customer: { id, fullName: "عميل اختبار" }, contracts: [], payments: [], operations: [] })),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getVehicleDetails: vehicleDetailsMock, getCustomerDetails: customerDetailsMock };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = { user: { id: 7, openId: "local_admin", name: "مدير النظام", email: null, loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "http", headers: {} }, res: {} } as TrpcContext;

describe("drill-down routes", () => {
  it("opens vehicle details by numeric id", async () => {
    const result = await appRouter.createCaller(context).vehicles.details({ id: 18 });
    expect(vehicleDetailsMock).toHaveBeenCalledWith(18);
    expect(result?.vehicle.plateNumber).toBe("GXR 8918");
  });

  it("opens customer details by numeric id", async () => {
    const result = await appRouter.createCaller(context).customers.details({ id: 23 });
    expect(customerDetailsMock).toHaveBeenCalledWith(23);
    expect(result?.customer.fullName).toBe("عميل اختبار");
  });
});
