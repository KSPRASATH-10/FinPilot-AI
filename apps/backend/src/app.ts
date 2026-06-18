import express from "express";
import "dotenv/config";
import cors from "cors";
import helmet from "helmet";
import { json, urlencoded } from "express";
import authRoutes from "./modules/auth/auth.routes";
import analyticsRoutes from "./modules/analytics/analytics.routes";
import assistantRoutes from "./modules/assistant/assistant.routes";
import billRoutes from "./modules/bills/bill.routes";
import reportRoutes from "./modules/reports/report.routes";
import transactionRoutes from "./modules/transactions/transactions.routes";
import voiceRoutes from "./modules/voice/voice.routes";

const app = express();

app.use(helmet());
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(json({ limit: "20mb" }));
app.use(urlencoded({ extended: true, limit: "20mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/assistant", assistantRoutes);
app.use("/api/v1/bills", billRoutes);
app.use("/api/v1/reports", reportRoutes);
app.use("/api/v1/transactions", transactionRoutes);
app.use("/api/v1/voice", voiceRoutes);

app.use("/api/v1/goals", (_req, res) => {
  res.json({ success: true, data: { items: [] } });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[ERROR]", err);
  res.status(err.status ?? 500).json({
    success: false,
    error: { message: err.message ?? "Internal server error" },
  });
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[FinPilot Backend] Running on http://0.0.0.0:${PORT}`);
});

export default app;