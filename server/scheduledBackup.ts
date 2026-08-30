import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import {
  users,
  customers,
  vehicles,
  contracts,
  contractOperations,
  payments,
  maintenanceRecords,
  deletionAudits,
  expenseTypes,
  employees,
  officeLiabilities,
  backupRuns,
} from "../drizzle/schema";
import { storageGetSignedUrl, storagePut } from "./storage";

const TABLES = [
  ["users", users],
  ["customers", customers],
  ["vehicles", vehicles],
  ["contracts", contracts],
  ["contractOperations", contractOperations],
  ["payments", payments],
  ["maintenanceRecords", maintenanceRecords],
  ["deletionAudits", deletionAudits],
  ["expenseTypes", expenseTypes],
  ["employees", employees],
  ["officeLiabilities", officeLiabilities],
  ["backupRuns", backupRuns],
] as const;

type Row = Record<string, unknown>;

function jsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonValue(v)]));
  return value;
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (typeof value === "bigint" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

export function getBackupDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function buildSql(tableName: string, rows: Row[]): string {
  if (!rows.length) return `-- ${tableName}: no rows\n`;
  const columns = Object.keys(rows[0]);
  const header = `-- ${tableName}: ${rows.length} rows\n`;
  const statements = rows.map(row => `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(", ")}) VALUES (${columns.map(c => sqlValue(row[c])).join(", ")});`);
  return `${header}${statements.join("\n")}\n`;
}

async function readAllRows(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("Database unavailable");
  const result: Record<string, Row[]> = {};
  for (const [name, table] of TABLES) result[name] = (await db.select().from(table)) as Row[];
  return result;
}

export async function scheduledDailyBackup(req: Request, res: Response) {
  const startedAt = new Date();
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user?.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const dayKey = getBackupDayKey(startedAt);
    const runKey = `${user.taskUid}:${dayKey}`;
    const existing = await db.select().from(backupRuns).where(eq(backupRuns.runKey, runKey)).limit(1);
    if (existing[0]?.status === "succeeded") return res.json({ ok: true, skipped: "already-completed", runKey, generatedAt: existing[0].generatedAt });
    if (existing[0]?.status === "started") return res.json({ ok: true, skipped: "already-running", runKey });
    await db.insert(backupRuns).values({ taskUid: user.taskUid, runKey, status: "started", generatedAt: startedAt });
    const rows = await readAllRows(db);
    const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
    const allRows = Object.values(rows).reduce((total, tableRows) => total + tableRows.length, 0);
    const sql = ["SET FOREIGN_KEY_CHECKS=0;", ...Object.entries(rows).map(([name, tableRows]) => buildSql(name, tableRows)), "SET FOREIGN_KEY_CHECKS=1;"].join("\n");
    const report = {
      generatedAt: startedAt.toISOString(),
      timezone: "Asia/Riyadh",
      taskUid: user.taskUid,
      tableCounts: Object.fromEntries(Object.entries(rows).map(([name, tableRows]) => [name, tableRows.length])),
      totalRows: allRows,
      contracts: rows.contracts,
      payments: rows.payments,
      expenses: rows.officeLiabilities,
    };
    const monthlyReport = {
      ...report,
      reportType: "monthly-cumulative",
      note: "تقرير تراكمي لجميع العقود والدفعات والمصاريف حتى وقت الإنشاء، مع إبقاء الإيرادات والمصروفات كمجموعات مستقلة.",
    };
    const backup = await storagePut(`backups/tajeerk-${stamp}.sql`, sql, "application/sql");
    const daily = await storagePut(`backups/tajeerk-daily-${stamp}.json`, JSON.stringify({ ...report, reportType: "daily" }, null, 2), "application/json");
    const monthly = await storagePut(`backups/tajeerk-monthly-${stamp}.json`, JSON.stringify(monthlyReport, null, 2), "application/json");
    const [backupUrl, dailyUrl, monthlyUrl] = await Promise.all([
      storageGetSignedUrl(backup.key),
      storageGetSignedUrl(daily.key),
      storageGetSignedUrl(monthly.key),
    ]);
    await db.update(backupRuns).set({ status: "succeeded", backupKey: backup.key, dailyReportKey: daily.key, monthlyReportKey: monthly.key }).where(eq(backupRuns.runKey, runKey));
    return res.json({ ok: true, runKey, generatedAt: startedAt.toISOString(), expiresIn: "storage-provider-default", files: { backup: backupUrl, dailyReport: dailyUrl, monthlyReport: monthlyUrl }, tableCounts: report.tableCounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const db = await getDb();
      const user = await sdk.authenticateRequest(req);
      if (db && user?.isCron && user.taskUid) {
        const dayKey = getBackupDayKey(startedAt);
        await db.update(backupRuns).set({ status: "failed", error: message }).where(eq(backupRuns.runKey, `${user.taskUid}:${dayKey}`));
      }
    } catch (logError) { console.warn("[Backup] Failed to persist error log", logError); }
    return res.status(500).json({ error: message, timestamp: new Date().toISOString(), context: { url: req.originalUrl } });
  }
}

export async function scheduledDailyBackupMarkSent(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user?.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const runKey = `${user.taskUid}:${getBackupDayKey(new Date())}`;
    const existing = await db.select().from(backupRuns).where(eq(backupRuns.runKey, runKey)).limit(1);
    if (!existing[0]) return res.status(404).json({ error: "backup-run-not-found" });
    if (existing[0].sentAt) return res.json({ ok: true, skipped: "already-sent", runKey, sentAt: existing[0].sentAt });
    await db.update(backupRuns).set({ sentAt: new Date() }).where(eq(backupRuns.runKey, runKey));
    return res.json({ ok: true, runKey, sentAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message, timestamp: new Date().toISOString(), context: { url: req.originalUrl } });
  }
}

export function buildBackupEmailBody(result: { generatedAt: string; files: { backup: string; dailyReport: string; monthlyReport: string } }) {
  return `نسخة تأجيرك اليومية جاهزة. تاريخ الإنشاء: ${result.generatedAt}. تم إنشاء نسخة SQL وتقرير يومي وتقرير شهري تراكمي. استخدم الروابط المرفقة الناتجة من نقطة النسخ لإرسال الملفات إلى المدير.`;
}

export function normalizeBackupPayload(payload: unknown) {
  return jsonValue(payload);
}
