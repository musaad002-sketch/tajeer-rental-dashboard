import mysql from "mysql2/promise";
import { beforeAll, describe, expect, it } from "vitest";
import { recordContractOperation } from "./db";
import { approveFinancialTransaction } from "./financialTransactions";

const dbUrl = new URL(process.env.DATABASE_URL ?? "mysql://invalid");
const pool = mysql.createPool({
  host: dbUrl.hostname,
  port: Number(dbUrl.port || 3306),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace(/^\//, ""),
});

describe("isolated payment acceptance", () => {
  let contractId = 0;
  let employeeId = 0;
  let managerId = 0;
  const suffix = Date.now();

  beforeAll(async () => {
    const [user] = await pool.query<any>("INSERT INTO users (openId, name, role, isActive) VALUES (?, ?, ?, ?)", [`TEST-PAY-EMP-${suffix}`, "Payment Acceptance Employee", "user", 1]);
    employeeId = Number(user.insertId);
    const [manager] = await pool.query<any>("INSERT INTO users (openId, name, role, isActive) VALUES (?, ?, ?, ?)", [`TEST-PAY-MGR-${suffix}`, "Payment Acceptance Manager", "admin", 1]);
    managerId = Number(manager.insertId);
    const [customer] = await pool.query<any>("INSERT INTO customers (identityNumber, fullName, phone) VALUES (?, ?, ?)", [`TEST-PAY-CUSTOMER-${suffix}`, "Payment Acceptance Customer", "0500000002"]);
    const customerId = Number(customer.insertId);
    const [vehicle] = await pool.query<any>("INSERT INTO vehicles (plateNumber, make, model, modelYear, dailyRate, monthlyRate, vehicleStatus) VALUES (?, ?, ?, ?, ?, ?, ?)", [`TEST-PAY-VEHICLE-${suffix}`, "Test", "Payment", 2026, "100.00", "2500.00", "available"]);
    const vehicleId = Number(vehicle.insertId);
    const [contract] = await pool.query<any>("INSERT INTO contracts (contractNumber, customerId, vehicleId, contractType, contractStatus, startDate, expectedReturnDate, rentalAmount, days, totalAmount, paidAmount, startMileage, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [`TEST-PAY-CONTRACT-${suffix}`, customerId, vehicleId, "daily", "active", "2026-09-15", "2026-09-24", "100.00", 9, "900.00", "0.00", 1000, employeeId]);
    contractId = Number(contract.insertId);
  });

  it("stores two independent payment records and preserves the original total", async () => {
    await recordContractOperation({ contractId, operation: "payment", amount: "300", paymentMethod: "cash", paymentReason: "rental", details: "TEST first payment", createdBy: employeeId, requestId: `TEST-PAY-1-${suffix}` });
    await recordContractOperation({ contractId, operation: "payment", amount: "350", paymentMethod: "network", paymentReason: "rental", details: "TEST second payment", createdBy: employeeId, requestId: `TEST-PAY-2-${suffix}` });
    const [rows] = await pool.query<any[]>("SELECT amount, paymentMethod, contractId, approvalStatus, createdAt FROM payments WHERE contractId = ? ORDER BY id", [contractId]);
    const [contractRows] = await pool.query<any[]>("SELECT totalAmount, paidAmount FROM contracts WHERE id = ?", [contractId]);
    const [transactions] = await pool.query<any[]>("SELECT id, amount, sourceTable, sourceId FROM financialTransactions WHERE contractId = ? AND transactionType = 'payment' ORDER BY id", [contractId]);
    expect(rows.map(row => [String(row.amount), row.paymentMethod, row.contractId])).toEqual([["300.00", "cash", contractId], ["350.00", "network", contractId]]);
    expect(rows.every(row => row.approvalStatus === "pending")).toBe(true);
    expect(String(contractRows[0].totalAmount)).toBe("900.00");
    expect(String(contractRows[0].paidAmount)).toBe("0.00");
    const transactionIds = transactions.map(row => Number(row.id));
    for (const transactionId of transactionIds) await approveFinancialTransaction(transactionId, managerId);
    const [approvedTransactions] = await pool.query<any[]>("SELECT amount, approvalStatus, sourceTable, sourceId FROM financialTransactions WHERE contractId = ? AND transactionType = 'payment' AND approvalStatus = 'approved' ORDER BY id", [contractId]);
    expect(approvedTransactions.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(650);
    expect(approvedTransactions.every(row => row.sourceTable === "payments")).toBe(true);
    expect(new Set(approvedTransactions.map(row => `${row.sourceTable}:${row.sourceId}`)).size).toBe(2);
    expect(transactions).toHaveLength(2);
    expect(transactions.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(650);
    expect(new Set(transactions.map(row => `${row.sourceTable}:${row.sourceId}`)).size).toBe(2);
  });
});
