import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateMaintenanceStatus: vi.fn(async (id: number, status: string, vehicleId: number) => ({ id, status, vehicleId })) }));
vi.mock("./db", async () => ({ ...(await vi.importActual<typeof import("./db")>("./db")), updateMaintenanceStatus: mocks.updateMaintenanceStatus }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = { user: { id: 1, openId: "operator", name: "تشغيل", email: null, loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "http", headers: {} }, res: {} } as TrpcContext;

describe("maintenance close", () => {
  it("يغلق سجل الصيانة قيد التنفيذ ويعيده إلى مكتمل", async () => {
    await expect(appRouter.createCaller(ctx).maintenance.updateStatus({ id: 21, vehicleId: 14, status: "completed" })).resolves.toEqual({ id: 21, status: "completed", vehicleId: 14 });
    expect(mocks.updateMaintenanceStatus).toHaveBeenCalledWith(21, "completed", 14);
  });
});
