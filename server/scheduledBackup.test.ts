import { describe, expect, it } from "vitest";
import { getBackupDayKey } from "./scheduledBackup";

describe("scheduled backup", () => {
  it("uses Asia/Riyadh day boundaries", () => {
    expect(getBackupDayKey(new Date("2026-08-30T20:59:59.000Z"))).toBe("2026-08-30");
    expect(getBackupDayKey(new Date("2026-08-30T21:00:00.000Z"))).toBe("2026-08-31");
  });
});
