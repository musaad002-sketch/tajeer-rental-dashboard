import { describe, expect, it } from "vitest";
import {
  noteStatusForResolution,
  requireVehicleNoteDecision,
} from "./vehicleNoteDecision";

describe("vehicle note decision policy", () => {
  it("requires a decision when an open note exists", () => {
    expect(() => requireVehicleNoteDecision(true)).toThrow(
      "يجب تحديد نتيجة معالجة ملاحظة السيارة المفتوحة قبل إنشاء العقد"
    );
  });

  it("allows contract creation without a decision when no open note exists", () => {
    expect(requireVehicleNoteDecision(false)).toBeUndefined();
  });

  it("maps repaired and not-needed choices to terminal note states", () => {
    expect(noteStatusForResolution("repaired")).toBe("repaired");
    expect(noteStatusForResolution("not_needed")).toBe("not_needed");
  });

  it("does not map not-repaired to a terminal state", () => {
    expect(requireVehicleNoteDecision(true, "not_repaired")).toBe(
      "not_repaired"
    );
  });
});
