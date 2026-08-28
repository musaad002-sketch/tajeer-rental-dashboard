import { describe, expect, it } from "vitest";
import { buildOperationEffects, getContractReference, validateVehicleSwap } from "./contractOperations";

describe("قواعد العمليات المرتبطة برقم العقد", () => {
  it("يفضل رقم العقد الظاهر على المعرّف الداخلي عند توفرهما", () => {
    expect(getContractReference({ contractNumber: "  1011 ", contractId: 44 })).toEqual({ kind: "contractNumber", value: "1011" });
  });

  it("يدعم المعرّف الداخلي للاستدعاءات القديمة ويمنع المرجع الفارغ", () => {
    expect(getContractReference({ contractId: 44 })).toEqual({ kind: "contractId", value: 44 });
    expect(getContractReference({})).toBeNull();
  });

  it("يفصل أثر الدفعة عن تغيير حالة العقد", () => {
    expect(buildOperationEffects("payment", "400")).toMatchObject({ shouldCreatePayment: true, contractStatus: undefined });
    expect(buildOperationEffects("close")).toMatchObject({ shouldCreatePayment: false, contractStatus: "closed", releasesVehicle: true });
    expect(buildOperationEffects("return")).toMatchObject({ contractStatus: "returned", releasesVehicle: true });
  });
});


describe("صلاحية تبديل السيارة", () => {
  it("يرفض السيارة نفسها والسيارة غير المتاحة", () => {
    expect(validateVehicleSwap(5, 5, true)).toEqual({ ok: false, reason: "اختر سيارة بديلة مختلفة" });
    expect(validateVehicleSwap(5, 6, false)).toEqual({ ok: false, reason: "السيارة البديلة غير متاحة" });
    expect(validateVehicleSwap(5, 6, true)).toEqual({ ok: true });
  });
});

describe("آثار فروع التشغيل", () => {
  it("يعرف آثار التمديد والتبديل والتعليق", () => {
    expect(buildOperationEffects("extension")).toMatchObject({ shouldCreatePayment: false });
    expect(buildOperationEffects("vehicle_swap")).toMatchObject({ shouldCreatePayment: false });
    expect(buildOperationEffects("suspend")).toMatchObject({ contractStatus: "suspended", releasesVehicle: true });
  });

  it("يفصل آثار الإغلاق والاسترجاع عن الدفع", () => {
    expect(buildOperationEffects("close")).toMatchObject({ shouldCreatePayment: false, contractStatus: "closed", releasesVehicle: true });
    expect(buildOperationEffects("return")).toMatchObject({ shouldCreatePayment: false, contractStatus: "returned", releasesVehicle: true });
  });
});
