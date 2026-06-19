import { Router, Response } from "express";
import fs from "fs";
import path from "path";
import { requireAuth, AuthRequest } from "../../middleware/auth";

const router = Router();
const DATA_DIR = path.join(process.cwd(), "data", "transactions");
const BUDGET_DIR = path.join(process.cwd(), "data", "budgets");

function userFile(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, `${safe}.json`);
}

function budgetFile(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(BUDGET_DIR, `${safe}.json`);
}

interface StoredTransaction {
  id: string;
  date: string;
  amount: number; // Stored natively in base currency scale (INR)
  category: string;
  description: string;
  type: "expense" | "income";
}

function loadTransactions(userId: string): StoredTransaction[] {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = userFile(userId);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf-8")) as StoredTransaction[];
  } catch { return []; }
}

function saveTransactions(userId: string, items: StoredTransaction[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(userFile(userId), JSON.stringify(items, null, 2), "utf-8");
  } catch (e: any) { console.error(`[Transactions] Save failure:`, e.message); }
}

// ─── GET /api/v1/transactions ─────────────────────────────────────────────────
router.get("/", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const items = loadTransactions(userId);
  
  // Fetch budget target threshold config block context to attach inline
  let limitValue = 25000; 
  try {
    const bFile = budgetFile(userId);
    if (fs.existsSync(bFile)) {
      limitValue = JSON.parse(fs.readFileSync(bFile, "utf-8")).monthlyLimit || 25000;
    }
  } catch {}

  return res.json({ success: true, data: { items, budgetLimit: limitValue } });
});

// ─── POST /api/v1/transactions ────────────────────────────────────────────────
router.post("/", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id, date, amount, category, description, type } = req.body;

  if (!amount || !date) {
    return res.status(400).json({ success: false, error: { message: "amount and date are required" } });
  }

  const tx: StoredTransaction = {
    id: id ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date,
    amount: Number(amount),
    category: category ?? "General",
    description: description ?? "",
    type: type === "income" ? "income" : "expense",
  };

  const items = loadTransactions(userId);
  const existing = items.findIndex((t) => t.id === tx.id);
  if (existing !== -1) items[existing] = tx;
  else items.unshift(tx);
  
  saveTransactions(userId, items);
  return res.status(201).json({ success: true, data: { transaction: tx } });
});

// ─── POST /api/v1/transactions/batch ─────────────────────────────────────────
router.post("/batch", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { items: incoming } = req.body as { items: any[] };

  if (!Array.isArray(incoming) || incoming.length === 0) {
    return res.status(400).json({ success: false, error: { message: "items array is required" } });
  }

  const existing = loadTransactions(userId);
  const existingIds = new Set(existing.map((t) => t.id));

  const toAdd: StoredTransaction[] = incoming
    .filter((t) => t && t.amount > 0 && t.date)
    .map((t) => ({
      id: t.id ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: t.date,
      amount: Number(t.amount),
      category: t.category ?? "General",
      description: t.description ?? "",
      type: (t.type === "income" ? "income" : "expense") as "expense" | "income",
    }))
    .filter((t) => !existingIds.has(t.id));

  const merged = [...toAdd, ...existing];
  saveTransactions(userId, merged);
  return res.status(201).json({ success: true, data: { count: toAdd.length } });
});

// ─── POST /api/v1/transactions/budget ─────────────────────────────────────────
// Updates or logs the baseline user budget limits ceiling caps
router.post("/budget", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { monthlyLimit } = req.body;

  if (!monthlyLimit || Number(monthlyLimit) <= 0) {
    return res.status(400).json({ success: false, error: { message: "Valid monthlyLimit threshold is required" } });
  }

  try {
    if (!fs.existsSync(BUDGET_DIR)) fs.mkdirSync(BUDGET_DIR, { recursive: true });
    fs.writeFileSync(budgetFile(userId), JSON.stringify({ monthlyLimit: Number(monthlyLimit) }, null, 2));
    return res.json({ success: true, data: { monthlyLimit: Number(monthlyLimit) } });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: { message: e.message } });
  }
});

// ─── DELETE /api/v1/transactions/:id ─────────────────────────────────────────
router.delete("/:id", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const items = loadTransactions(userId);
  const filtered = items.filter((t) => t.id !== id);

  if (filtered.length === items.length) {
    return res.status(404).json({ success: false, error: { message: "Transaction not found" } });
  }

  saveTransactions(userId, filtered);
  return res.json({ success: true, data: { deleted: id } });
});

export default router;