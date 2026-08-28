import express from "express";
import { createServer } from "http";
import { afterEach, describe, expect, it, vi } from "vitest";

const { authenticateMock, paymentMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(async () => ({ id: 1, role: "admin" })),
  paymentMock: vi.fn(async () => ({
    payment: { id: 42, amount: "125.00", method: "network", notes: "دفعة اختبار", createdAt: new Date("2026-08-27T15:00:00Z") },
    contract: { contractNumber: "1031" },
    customer: { fullName: "عميل اختبار" },
  })),
}));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: authenticateMock } }));
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getPaymentForReceipt: paymentMock };
});

import { registerReceiptPdfRoute } from "./_core/index";

describe("receipt PDF endpoint", () => {
  let server: ReturnType<typeof createServer> | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
    authenticateMock.mockClear();
    paymentMock.mockClear();
  });

  it("returns an authenticated PDF for a persisted payment id", async () => {
    const app = express();
    registerReceiptPdfRoute(app);
    server = createServer(app);
    await new Promise<void>((resolve) => server?.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not expose a port");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/pdf/receipt/42`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    expect(paymentMock).toHaveBeenCalledWith(42);
  });
});
