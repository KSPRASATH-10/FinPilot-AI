import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../../middleware/auth";
import fs from "fs";
import path from "path";

const router = Router();

// ─── Directory constants ──────────────────────────────────────────────────────
const SCAN_DIR = path.join(process.cwd(), "data", "scans");
const TX_DIR   = path.join(process.cwd(), "data", "transactions");
const BUDGET_DIR = path.join(process.cwd(), "data", "budgets");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Scan history helpers ─────────────────────────────────────────────────────
function scanFile(userId: string): string {
  ensureDir(SCAN_DIR);
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(SCAN_DIR, `${safe}.json`);
}

interface ScanRecord {
  merchantName: string;
  totalCost: number;
  items: { name: string; amount: number; category: string }[];
  timestamp: number;
  date: string;
}

function loadScanHistory(userId: string): ScanRecord[] {
  try {
    const file = scanFile(userId);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf-8")) as ScanRecord[];
  } catch { return []; }
}

function appendScanRecord(userId: string, record: ScanRecord): void {
  try {
    const existing = loadScanHistory(userId);
    const updated = [record, ...existing].slice(0, 20);
    fs.writeFileSync(scanFile(userId), JSON.stringify(updated, null, 2), "utf-8");
    console.log(`[Scans] Saved scan for user ${userId} (${updated.length} total)`);
  } catch (e: any) {
    console.error("[Scans] Failed to save scan record:", e.message);
  }
}

// ─── Duplicate detection (5-minute sliding window) ────────────────────────────
// Returns true if an entry with the same merchantName and totalCost was recorded
// within the last 5 minutes. The check is case-insensitive and amount-exact.
function isDuplicateInWindow(userId: string, merchantName: string, totalCost: number): boolean {
  const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  const history = loadScanHistory(userId);
  return history.some(
    (r) =>
      r.timestamp > now - WINDOW_MS &&
      Math.abs(r.totalCost - totalCost) < 0.01 &&
      r.merchantName.trim().toLowerCase() === merchantName.trim().toLowerCase()
  );
}

// ─── Budget engine helpers ────────────────────────────────────────────────────
// Default monthly budget allocations per category (rupees).
// These are the baseline targets; the engine adjusts remaining headroom dynamically.
const DEFAULT_MONTHLY_BUDGETS: Record<string, number> = {
  Food: 12000,
  Transport: 5000,
  Utilities: 4000,
  Healthcare: 3000,
  Entertainment: 4000,
  Education: 5000,
  General: 3000,
};

// Flexible categories that can absorb budget overflow from other categories.
const FLEXIBLE_CATEGORIES = ["Entertainment", "General", "Food"];

interface BudgetAllocation {
  category: string;
  allocated: number;
  spent: number;
  remaining: number;
}

interface BudgetStore {
  allocations: Record<string, number>;
  updatedAt: string;
}

function budgetFile(userId: string): string {
  ensureDir(BUDGET_DIR);
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(BUDGET_DIR, `${safe}.json`);
}

function loadBudgetStore(userId: string): BudgetStore {
  try {
    const file = budgetFile(userId);
    if (!fs.existsSync(file)) {
      return { allocations: { ...DEFAULT_MONTHLY_BUDGETS }, updatedAt: new Date().toISOString() };
    }
    return JSON.parse(fs.readFileSync(file, "utf-8")) as BudgetStore;
  } catch {
    return { allocations: { ...DEFAULT_MONTHLY_BUDGETS }, updatedAt: new Date().toISOString() };
  }
}

function saveBudgetStore(userId: string, store: BudgetStore): void {
  try {
    fs.writeFileSync(budgetFile(userId), JSON.stringify(store, null, 2), "utf-8");
  } catch (e: any) {
    console.error("[Budget] Failed to save budget store:", e.message);
  }
}

function loadUserTransactions(userId: string): any[] {
  try {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const file = path.join(TX_DIR, `${safe}.json`);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch { return []; }
}

// Computes current month's spending per category from transaction log.
function getMonthlySpendByCategory(userId: string): Record<string, number> {
  const txs = loadUserTransactions(userId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const spent: Record<string, number> = {};
  txs.forEach((tx) => {
    if (tx.type === "income") return;
    const txTime = new Date(tx.date).getTime();
    if (txTime < monthStart) return;
    const cat = tx.category ?? "General";
    spent[cat] = (spent[cat] ?? 0) + Number(tx.amount || 0);
  });
  return spent;
}

interface BudgetAdjustmentResult {
  triggered: boolean;
  overflowCategory: string;
  overflowAmount: number;
  adjustments: { category: string; oldRemaining: number; newRemaining: number; cutAmount: number }[];
  message: string;
}

// Core budget rebalancing engine.
// When a category exceeds its allocation, redistribute the overflow by trimming
// headroom from flexible categories proportionally.
function runBudgetOptimisation(
  userId: string,
  newItems: { name: string; amount: number; category: string }[]
): BudgetAdjustmentResult {
  const budgetStore = loadBudgetStore(userId);
  const allocations = budgetStore.allocations;
  const spent = getMonthlySpendByCategory(userId);

  // Find which category is hit by the new items
  const categoryDeltas: Record<string, number> = {};
  newItems.forEach((item) => {
    categoryDeltas[item.category] = (categoryDeltas[item.category] ?? 0) + item.amount;
  });

  let triggered = false;
  let overflowCategory = "";
  let overflowAmount = 0;
  const adjustments: BudgetAdjustmentResult["adjustments"] = [];

  for (const [cat, delta] of Object.entries(categoryDeltas)) {
    const allocated = allocations[cat] ?? DEFAULT_MONTHLY_BUDGETS[cat] ?? 5000;
    const currentSpent = (spent[cat] ?? 0) + delta;
    const overage = currentSpent - allocated;

    if (overage <= 0) continue; // within budget — no action needed

    triggered = true;
    overflowCategory = cat;
    overflowAmount = overage;

    console.log(`[Budget] ${cat} exceeded by ₹${overage}. Rebalancing flexible categories...`);

    // Calculate total flexible headroom available
    const flexibleHeadroom = FLEXIBLE_CATEGORIES
      .filter((fc) => fc !== cat)
      .reduce((sum, fc) => {
        const fcAllocated = allocations[fc] ?? DEFAULT_MONTHLY_BUDGETS[fc] ?? 3000;
        const fcSpent = spent[fc] ?? 0;
        return sum + Math.max(0, fcAllocated - fcSpent);
      }, 0);

    if (flexibleHeadroom <= 0) break; // no headroom to absorb — skip adjustment

    // Proportionally cut headroom from flexible categories
    let remainingToAbsorb = Math.min(overage, flexibleHeadroom);
    FLEXIBLE_CATEGORIES
      .filter((fc) => fc !== cat)
      .forEach((fc) => {
        if (remainingToAbsorb <= 0) return;
        const fcAllocated = allocations[fc] ?? DEFAULT_MONTHLY_BUDGETS[fc] ?? 3000;
        const fcSpent = spent[fc] ?? 0;
        const fcHeadroom = Math.max(0, fcAllocated - fcSpent);
        if (fcHeadroom <= 0) return;

        const proportion = fcHeadroom / flexibleHeadroom;
        const cutAmount = Math.min(fcHeadroom, Math.ceil(remainingToAbsorb * proportion));

        const oldRemaining = fcHeadroom;
        allocations[fc] = Math.max(0, fcAllocated - cutAmount);
        const newRemaining = Math.max(0, allocations[fc] - fcSpent);

        adjustments.push({ category: fc, oldRemaining, newRemaining, cutAmount });
        remainingToAbsorb -= cutAmount;
      });

    // Persist updated allocations
    budgetStore.allocations = allocations;
    budgetStore.updatedAt = new Date().toISOString();
    saveBudgetStore(userId, budgetStore);
    break; // only rebalance for the first overflowing category per confirm
  }

  if (!triggered) {
    return { triggered: false, overflowCategory: "", overflowAmount: 0, adjustments: [], message: "" };
  }

  const adjustmentSummary = adjustments
    .map((a) => `${a.category} by ₹${a.cutAmount}`)
    .join(" and ");

  const message = adjustments.length > 0
    ? `Budget exceeded in ${overflowCategory} by ₹${Math.round(overflowAmount)}. FinPilot AI has automatically reduced your remaining ${adjustmentSummary} budget to keep your monthly savings target on track.`
    : `Budget exceeded in ${overflowCategory} by ₹${Math.round(overflowAmount)}. No flexible budget headroom available to rebalance — consider reviewing your monthly allocations.`;

  return { triggered, overflowCategory, overflowAmount, adjustments, message };
}

// ─── GET /api/v1/bills/history ────────────────────────────────────────────────
router.get("/history", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const history = loadScanHistory(userId);
  return res.json({ success: true, data: { scans: history } });
});

// ─── POST /api/v1/bills/confirm ───────────────────────────────────────────────
router.post("/confirm", requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { merchantName, totalCost, items, date, overrideDuplicate } = req.body as {
      merchantName?: string;
      totalCost?: number;
      items?: { name: string; amount: number; category: string }[];
      date?: string;
      overrideDuplicate?: boolean;
    };

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: { message: "items array is required" } });
    }

    const resolvedMerchant = merchantName ?? "Receipt";
    const resolvedTotal = Number(totalCost) || items.reduce((s, i) => s + i.amount, 0);

    // ── Duplicate detection (5-minute sliding window) ──────────────────────
    if (!overrideDuplicate) {
      const duplicate = isDuplicateInWindow(userId, resolvedMerchant, resolvedTotal);
      if (duplicate) {
        console.log(`[Scans] Duplicate detected for user ${userId}: ${resolvedMerchant} ₹${resolvedTotal}`);
        return res.status(409).json({
          success: false,
          isPotentialDuplicate: true,
          error: {
            message: `A bill from "${resolvedMerchant}" for ₹${resolvedTotal} was already recorded within the last 5 minutes.`,
          },
        });
      }
    }

    const record: ScanRecord = {
      merchantName: resolvedMerchant,
      totalCost: resolvedTotal,
      items,
      timestamp: Date.now(),
      date: date ?? new Date().toISOString(),
    };

    appendScanRecord(userId, record);

    // ── Budget optimisation engine ─────────────────────────────────────────
    const budgetResult = runBudgetOptimisation(userId, items);
    console.log(`[Budget] Optimisation triggered: ${budgetResult.triggered}`);

    return res.status(201).json({
      success: true,
      data: {
        record,
        budgetOptimisation: budgetResult.triggered ? budgetResult : null,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: { message: e.message } });
  }
});

// ─── POST /api/v1/bills/scan ─────────────────────────────────────────────────
router.post("/scan", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";
    const { imageBase64, mimeType } = req.body as { imageBase64?: string; mimeType?: string };

    let items: { name: string; amount: number; category: string }[] = [];
    let total = 0;
    let merchant = "Scanned Receipt";

    if (imageBase64 && GEMINI_KEY) {
      try {
        const mime = mimeType || "image/jpeg";
        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

        const gemRes = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inline_data: { mime_type: mime, data: imageBase64 } },
                  {
                    text: `You are a receipt OCR parser. Extract every single line item from this bill image.
Return ONLY a raw valid JSON object matching this exact layout signature. Do not include any explanation, conversational text, introduction or markdown fences.

Format structure:
{"merchant":"store name","date":"YYYY-MM-DD","total":number,"items":[{"name":"item name","amount":number,"category":"Food|Transport|Utilities|Healthcare|Entertainment|General"}]}

If you cannot read the image text clearly at all, return exactly: {"merchant":"Unknown","date":"${new Date().toISOString().split("T")[0]}","total":0,"items":[]}`,
                  },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 1500,
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        });

        if (gemRes.ok) {
          const gemBody = await gemRes.json() as any;
          const rawText: string = gemBody?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          let jsonString = rawText.trim();
          const startBrace = jsonString.indexOf("{");
          const endBrace = jsonString.lastIndexOf("}");
          if (startBrace !== -1 && endBrace !== -1) {
            jsonString = jsonString.substring(startBrace, endBrace + 1);
            try {
              const parsed = JSON.parse(jsonString);
              merchant = parsed.merchant || merchant;
              if (Array.isArray(parsed.items)) {
                items = parsed.items
                  .filter((i: any) => i && (i.name || i.description))
                  .map((i: any) => ({
                    name: String(i.name || i.description).trim(),
                    amount: Math.abs(parseFloat(i.amount)) || 0,
                    category: ["Food", "Transport", "Utilities", "Healthcare", "Entertainment", "General"].includes(i.category)
                      ? i.category : "General",
                  }))
                  .filter((i: any) => i.amount > 0);
              }
              total = Math.abs(parseFloat(parsed.total)) || items.reduce((s, i) => s + i.amount, 0);
            } catch (jsonErr: any) {
              console.error("[OCR] JSON parse error:", jsonErr.message);
            }
          }
        } else {
          const errText = await gemRes.text();
          console.error("[OCR] Gemini API error:", gemRes.status, errText.slice(0, 400));
        }
      } catch (err: any) {
        console.error("[OCR] Exception:", err.message);
      }
    }

    const isFallback = items.length === 0;
    if (isFallback) {
      items = [
        { name: "Groceries", amount: 650, category: "Food" },
        { name: "Beverages", amount: 250, category: "Food" },
        { name: "Household Items", amount: 350, category: "Utilities" },
        { name: "Snacks & Confectionery", amount: 200, category: "Food" },
      ];
      total = items.reduce((s, i) => s + i.amount, 0);
    }

    return res.json({
      success: true,
      isPlaceholderFallback: isFallback,
      data: { merchant, date: new Date().toISOString(), total, items },
    });
  } catch (e: any) {
    console.error("[OCR] Fatal error:", e.message);
    return res.status(500).json({ success: false, error: { message: e.message } });
  }
});

export default router;