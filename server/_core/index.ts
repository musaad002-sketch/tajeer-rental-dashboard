import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { sdk } from "./sdk";
import { getDb, getPaymentForReceipt } from "../db";
import { contracts, customers, vehicles } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { formatReceiptData, generateContractPdf, generateReceiptPdf } from "../pdf";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

export function registerReceiptPdfRoute(app: express.Express) {
  app.get("/api/pdf/receipt/:paymentId", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user) return res.status(401).send("Unauthorized");
      const paymentId = parseInt(req.params.paymentId);
      if (!Number.isInteger(paymentId) || paymentId < 1) return res.status(400).send("Invalid payment id");
      const row = await getPaymentForReceipt(paymentId);
      if (!row) return res.status(404).send("Payment not found");
      const origin = `${req.protocol}://${req.get("host")}`;
      const pdf = await generateReceiptPdf(formatReceiptData(row), origin);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=receipt-${row.payment.id}.pdf`);
      res.send(Buffer.from(pdf));
    } catch (e) { res.status(500).send("Error generating PDF"); }
  });
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // PDF Endpoints
  app.get("/api/pdf/contract/:id", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user) return res.status(401).send("Unauthorized");
      const db = await getDb();
      if (!db) return res.status(503).send("Database unavailable");
      const id = parseInt(req.params.id);
      const [row] = await db.select({ contract: contracts, customer: customers, vehicle: vehicles }).from(contracts).leftJoin(customers, eq(contracts.customerId, customers.id)).leftJoin(vehicles, eq(contracts.vehicleId, vehicles.id)).where(eq(contracts.id, id)).limit(1);
      if (!row) return res.status(404).send("Contract not found");
      const origin = `${req.protocol}://${req.get("host")}`;
      const pdf = await generateContractPdf({ contractNumber: row.contract.contractNumber, customerName: row.customer?.fullName, identityNumber: row.customer?.identityNumber, vehicleMake: row.vehicle?.make, vehicleModel: row.vehicle?.model, plateNumber: row.vehicle?.plateNumber, startDate: row.contract.startDate, expectedReturnDate: row.contract.expectedReturnDate, totalAmount: row.contract.totalAmount, paidAmount: row.contract.paidAmount }, origin);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=contract-${row.contract.contractNumber}.pdf`);
      res.send(Buffer.from(pdf));
    } catch (e) { res.status(500).send("Error generating PDF"); }
  });

  registerReceiptPdfRoute(app);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) startServer().catch(console.error);
