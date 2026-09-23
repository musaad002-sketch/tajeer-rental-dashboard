import { describe, expect, it, beforeAll } from "vitest";
import mysql, { type ResultSetHeader } from "mysql2/promise";
import { createContract, createVehicleNote, listOpenVehicleNotes, resolveVehicleNote } from "./db";

const dbUrl = new URL(process.env.DATABASE_URL ?? "mysql://invalid");
const connectionConfig = {
  host: dbUrl.hostname,
  port: Number(dbUrl.port || 3306),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace(/^\//, ""),
};

const connection = mysql.createPool(connectionConfig);

let testUserId: number;
let testCustomerId: number;
let testVehicleId: number;
let testContractId: number;
let firstNoteId: number;

describe("isolated Vehicle Notes acceptance", () => {
  beforeAll(async () => {
    const fixtureSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const [userResult] = await connection.query<ResultSetHeader>("INSERT INTO users (openId, name, role, isActive) VALUES (?, ?, ?, ?)", [`TEST-USER-${fixtureSuffix}`, "Acceptance Admin", "admin", 1]);
    testUserId = Number(userResult.insertId);
    const [customerResult] = await connection.query<ResultSetHeader>("INSERT INTO customers (identityNumber, fullName, phone) VALUES (?, ?, ?)", [`TEST-CUSTOMER-${fixtureSuffix}`, "Acceptance Customer", `050${String(userResult.insertId).padStart(7, "0")}`]);
    testCustomerId = Number(customerResult.insertId);
    const [vehicleResult] = await connection.query<ResultSetHeader>("INSERT INTO vehicles (plateNumber, make, model, modelYear, dailyRate, monthlyRate, mileage, vehicleStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [`TEST-VEHICLE-${fixtureSuffix}`, "Test", "Model", 2026, "100.00", "2500.00", 1000, "available"]);
    testVehicleId = Number(vehicleResult.insertId);
    const [contractResult] = await connection.query<ResultSetHeader>("INSERT INTO contracts (contractNumber, customerId, vehicleId, contractType, contractStatus, startDate, expectedReturnDate, rentalAmount, days, totalAmount, paidAmount, startMileage, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [`TEST-CONTRACT-${fixtureSuffix}`, testCustomerId, testVehicleId, "daily", "closed", "2026-09-01", "2026-09-02", "900.00", 1, "900.00", "650.00", 900, testUserId]);
    testContractId = Number(contractResult.insertId);
  });

  it("persists a note linked to the vehicle and prior contract", async () => {
    firstNoteId = await createVehicleNote({ vehicleId: testVehicleId, sourceContractId: testContractId, sourceCustomerId: testCustomerId, note: "TEST NOTE: inspect rear door", createdBy: testUserId, managerFollowUpRequired: true });
    const rows = await listOpenVehicleNotes(testVehicleId);
    expect(firstNoteId).toBeGreaterThan(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note.note).toContain("TEST NOTE");
    expect(rows[0]?.note.sourceContractId).toBe(testContractId);
    expect(rows[0]?.vehicle?.plateNumber).toContain("TEST-VEHICLE-");
  });

  it("preserves the three resolution outcomes and keeps not_repaired open", async () => {
    await resolveVehicleNote({ id: firstNoteId, resolution: "not_repaired", resolutionReason: "TEST follow-up required", resolvedBy: testUserId });
    expect((await listOpenVehicleNotes(testVehicleId)).map(row => row.note.resolution)).toContain("not_repaired");
    await resolveVehicleNote({ id: firstNoteId, resolution: "repaired", resolutionReason: "TEST repaired", resolvedBy: testUserId });
    expect(await listOpenVehicleNotes(testVehicleId)).toHaveLength(0);
    const notNeededId = await createVehicleNote({ vehicleId: testVehicleId, sourceContractId: testContractId, sourceCustomerId: testCustomerId, note: "TEST NOTE: cosmetic mark", createdBy: testUserId });
    await resolveVehicleNote({ id: notNeededId, resolution: "not_needed", resolutionReason: "TEST no repair needed", resolvedBy: testUserId });
    expect(await listOpenVehicleNotes(testVehicleId)).toHaveLength(0);
  });

  it("allows a new contract with explicit not_repaired while retaining follow-up state", async () => {
    await createVehicleNote({ vehicleId: testVehicleId, sourceContractId: testContractId, sourceCustomerId: testCustomerId, note: "TEST NOTE: unresolved mechanical issue", createdBy: testUserId, managerFollowUpRequired: true });
    const contractId = await createContract({ contractNumber: `TEST-CONTRACT-${Date.now()}`, customerId: testCustomerId, vehicleId: testVehicleId, vehicleMileage: 1100, vehicleNoteResolution: "not_repaired", type: "daily", contractScope: "domestic_open", startDate: "2026-09-15", expectedReturnDate: "2026-09-16", rentalAmount: "100.00", days: 1, totalAmount: "100.00", paidAmount: "0.00", createdBy: testUserId });
    expect(contractId.id).toBeGreaterThan(0);
    const rows = await listOpenVehicleNotes(testVehicleId);
    expect(rows.some(row => row.note.managerFollowUpRequired)).toBe(true);
  });
});
