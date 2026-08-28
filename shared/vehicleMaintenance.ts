export function calculateOilMaintenance(input: {
  currentMileage: number;
  lastOilChangeMileage?: number | null;
  oilChangeInterval?: number | null;
}) {
  if (input.lastOilChangeMileage == null) {
    return { travelled: null, remaining: null, due: false };
  }

  const interval = Number.isFinite(input.oilChangeInterval) && Number(input.oilChangeInterval) > 0
    ? Math.trunc(Number(input.oilChangeInterval))
    : 5000;
  const travelled = Math.max(0, Math.trunc(input.currentMileage) - Math.trunc(input.lastOilChangeMileage));
  const remaining = Math.max(0, interval - travelled);
  return { travelled, remaining, due: travelled >= interval };
}

export function isMileageAdvanceValid(currentMileage: number, nextMileage: number) {
  return Number.isInteger(nextMileage) && nextMileage >= 0 && nextMileage >= currentMileage;
}
