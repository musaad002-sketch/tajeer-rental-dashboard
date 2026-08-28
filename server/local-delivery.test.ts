import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

describe("local delivery safeguards", () => {
  it("requires explicit RESTORE confirmation and recreates the database", async () => {
    const script = await readFile(path.join(root, "restore-local-db.ps1"), "utf8");
    expect(script).toContain("RESTORE");
    expect(script).toContain("DROP DATABASE IF EXISTS");
    expect(script).toContain("CREATE DATABASE");
  });

  it("exposes the receipt endpoint by payment id", async () => {
    const source = await readFile(path.join(root, "server/_core/index.ts"), "utf8");
    expect(source).toContain('/api/pdf/receipt/:paymentId');
    expect(source).toContain("getPaymentForReceipt(paymentId)");
    expect(source).toContain("formatReceiptData(row)");
  });
});
