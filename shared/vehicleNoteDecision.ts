export type VehicleNoteResolution = "repaired" | "not_repaired" | "not_needed";

export function requireVehicleNoteDecision(
  hasOpenNotes: boolean,
  resolution?: VehicleNoteResolution
): VehicleNoteResolution | undefined {
  if (hasOpenNotes && !resolution) {
    throw new Error(
      "يجب تحديد نتيجة معالجة ملاحظة السيارة المفتوحة قبل إنشاء العقد"
    );
  }
  return resolution;
}

export function noteStatusForResolution(
  resolution: Exclude<VehicleNoteResolution, "not_repaired">
) {
  return resolution === "repaired"
    ? ("repaired" as const)
    : ("not_needed" as const);
}
