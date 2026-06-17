import { Router, Response } from "express";
import fs from "fs";
import path from "path";
import { requireAuth, AuthRequest } from "../../middleware/auth";

const router = Router();

const DATA_DIR = path.join(process.cwd(), "data", "transactions");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userFile(userId: string): string {
  // One JSON file per user: data/transactions/<userId>.json
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, `${safe}.json`);
}

interface StoredTransaction {
  id: string;
  date: string;
  amount: number;
  category: string;
  description: string;
  type: "expense" | "income";
}

function loadTransactions(userId: string): StoredTransaction[] {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = userFile(userId);
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw) as StoredTransaction[];
  } catch {
    return [];
  }
}

function saveTransactions(userId: string, items: StoredTransaction[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(userFile(userId), JSON.stringify(items, null, 2), "utf-8");
  } catch (e: any) {
    console.error(`[Transactions] Failed to save for user ${userId}:`, e.message);
  }
}

// ─── GET /api/v1/transactions ─────────────────────────────────────────────────
// Returns all transactions for the authenticated user, newest first.

router.get("/", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const items = loadTransactions(userId);
  return res.json({ success: true, data: { items } });
});

// ─── POST /api/v1/transactions ────────────────────────────────────────────────
// Adds a single transaction and persists to disk immediately.

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
  // Deduplicate by id to prevent double-saves on retry
  const existing = items.findIndex((t) => t.id === tx.id);
  if (existing !== -1) {
    items[existing] = tx;
  } else {
    items.unshift(tx); // newest first
  }
  saveTransactions(userId, items);

  console.log(`[Transactions] Saved tx ${tx.id} for user ${userId} (${items.length} total)`);
  return res.status(201).json({ success: true, data: { transaction: tx } });
});

// ─── POST /api/v1/transactions/batch ─────────────────────────────────────────
// Saves multiple transactions at once (used after bill scan confirm).

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
      // 🚀 FIXED: Explicit cast prevents type widening string assignment conflicts
      type: (t.type === "income" ? "income" : "expense") as "expense" | "income",
    }))
    .filter((t) => !existingIds.has(t.id));

  const merged = [...toAdd, ...existing]; // prepend new ones
  saveTransactions(userId, merged);

  console.log(`[Transactions] Batch saved ${toAdd.length} tx for user ${userId} (${merged.length} total)`);
  return res.status(201).json({ success: true, data: { count: toAdd.length } });
});

// ─── DELETE /api/v1/transactions/:id ─────────────────────────────────────────
// Removes a single transaction by id.

router.delete("/:id", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const items = loadTransactions(userId);
  const filtered = items.filter((t) => t.id !== id);

  if (filtered.length === items.length) {
    return res.status(404).json({ success: false, error: { message: "Transaction not found" } });
  }

  saveTransactions(userId, filtered);
  console.log(`[Transactions] Deleted tx ${id} for user ${userId}`);
  return res.json({ success: true, data: { deleted: id } });
});

// ─── DELETE /api/v1/transactions (wipe all for account deletion) ──────────────

router.delete("/", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  saveTransactions(userId, []);
  console.log(`[Transactions] Wiped all transactions for user ${userId}`);
  return res.json({ success: true, data: { message: "All transactions deleted" } });
});

export default router;