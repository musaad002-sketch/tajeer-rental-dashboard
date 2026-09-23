export type OdometerSource = "vehicle" | "maintenance" | "oil_change" | "contract" | "return" | "correction";

export type DocumentedOdometer = {
  source: OdometerSource;
  reading: number | null | undefined;
};

export type OdometerValidation = {
  reading: number;
  previousReading: number;
  difference: number;
  corrected: boolean;
};

export function latestDocumentedOdometer(readings: DocumentedOdometer[]) {
  const valid = readings.map(({ reading }) => reading).filter((reading): reading is number => typeof reading === "number" && Number.isInteger(reading) && reading >= 0);
  return valid.length ? Math.max(...valid) : 0;
}

export function validateOdometerReading(input: {
  reading: number | null | undefined;
  documentedReadings: DocumentedOdometer[];
  correctionReason?: string;
}): OdometerValidation {
  if (input.reading === null || input.reading === undefined) throw new Error("يجب إدخال قراءة العداد");
  if (!Number.isInteger(input.reading) || input.reading < 0) throw new Error("قراءة العداد يجب أن تكون رقماً صحيحاً غير سالب");
  const previousReading = latestDocumentedOdometer(input.documentedReadings);
  const corrected = input.reading < previousReading;
  if (corrected && !input.correctionReason?.trim()) throw new Error(`قراءة العداد أقل من آخر قراءة موثقة (${previousReading})؛ يلزم سبب تصحيح موثق`);
  return { reading: input.reading, previousReading, difference: input.reading - previousReading, corrected };
}

export function requiresOdometerReading(operation: string) {
  return operation === "new_contract" || operation === "close" || operation === "vehicle_swap" || operation === "return" || operation === "suspend";
}

export function calculateOdometerDistance(startReading: number | null | undefined, endReading: number | null | undefined) {
  if (typeof startReading !== "number" || typeof endReading !== "number" || !Number.isInteger(startReading) || !Number.isInteger(endReading) || startReading < 0 || endReading < startReading) throw new Error("قراءات العداد غير صالحة لحساب المسافة");
  return endReading - startReading;
}
