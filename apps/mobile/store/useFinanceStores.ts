import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";

// @ts-ignore
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://10.119.233.135:4000";

async function authFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().user?.accessToken;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...opts,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
    });
    clearTimeout(timer);
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error?.message || "API error");
    return body.data ?? body;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

export interface TransactionItem {
  id?: string;
  date: string;
  amount: number;
  category?: string;
  description?: string;
  type?: "expense" | "income";
}

export interface FinanceSummary {
  income: number;
  expenses: number;
  savings: number;
  healthScore: number;
  byCategory: Record<string, number>;
}

export function deriveSummary(transactions: TransactionItem[]): FinanceSummary {
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);

  const expenseTxs = transactions.filter((t) => t.type !== "income");
  const expenses = expenseTxs.reduce((s, t) => s + t.amount, 0);

  const byCategory: Record<string, number> = {};
  expenseTxs.forEach((t) => {
    const cat = t.category ?? "General";
    byCategory[cat] = (byCategory[cat] ?? 0) + t.amount;
  });

  const savings = Math.max(income - expenses, 0);

  let healthScore = 0;
  if (income > 0) {
    const rate = savings / income;
    healthScore = Math.min(100, Math.round(40 + rate * 100));
  } else if (expenses > 0) {
    healthScore = 20; // has expenses but no income recorded
  }

  return { income, expenses, savings, healthScore, byCategory };
}

// ─── Silent backend sync helpers ──────────────────────────────────────────────
// Fire-and-forget: local state is always updated immediately.
// Backend sync failure is silent — data stays in local Zustand state.

async function syncAddToBackend(tx: TransactionItem): Promise<void> {
  try {
    await authFetch("/api/v1/transactions", {
      method: "POST",
      body: JSON.stringify(tx),
    });
  } catch {
    // Silent — local state is already updated
  }
}

async function syncDeleteToBackend(id: string): Promise<void> {
  try {
    await authFetch(`/api/v1/transactions/${id}`, { method: "DELETE" });
  } catch {
    // Silent
  }
}

// ─── Transaction Store ────────────────────────────────────────────────────────

interface TransactionState {
  transactions: TransactionItem[];
  addTransaction: (tx: TransactionItem) => void;
  removeTransaction: (id: string) => void;
  fetchTransactions: () => Promise<void>;
  resetTransactions: () => void;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],

  addTransaction: (tx) => {
    // 1. Update local state immediately (UI responds instantly)
    const next = [tx, ...get().transactions];
    set({ transactions: next });
    // 2. Recompute analytics from new state
    useAnalyticsStore.getState().recomputeSummary();
    // 3. Persist to backend (fire and forget)
    syncAddToBackend(tx);
  },

  removeTransaction: (id) => {
    const next = get().transactions.filter((t) => t.id !== id);
    set({ transactions: next });
    useAnalyticsStore.getState().recomputeSummary();
    if (id) syncDeleteToBackend(id);
  },

  fetchTransactions: async () => {
    // Called on app launch / screen focus.
    // Loads from backend (which reads from disk) and replaces local state.
    // This is the only place where backend data can overwrite local state.
    try {
      const data = await authFetch<{ items: TransactionItem[] }>("/api/v1/transactions");
      const items = data.items ?? [];
      set({ transactions: items });
      useAnalyticsStore.getState().recomputeSummary();
    } catch {
      // Backend unreachable — keep whatever is already in local Zustand state
    }
  },

  resetTransactions: () => {
    set({ transactions: [] });
    useAnalyticsStore.getState().recomputeSummary();
    // Also wipe on backend (used during account deletion)
    try {
      authFetch("/api/v1/transactions", { method: "DELETE" });
    } catch {
      // Silent
    }
  },
}));

// ─── Analytics Store ──────────────────────────────────────────────────────────

interface AnalyticsState {
  summary: FinanceSummary | null;
  recomputeSummary: () => void;
  fetchSummary: () => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  summary: { income: 0, expenses: 0, savings: 0, healthScore: 0, byCategory: {} },

  recomputeSummary: () => {
    const txs = useTransactionStore.getState().transactions;
    set({ summary: deriveSummary(txs) });
  },

  fetchSummary: async () => {
    const txs = useTransactionStore.getState().transactions;
    set({ summary: deriveSummary(txs) });
  },
}));

// ─── Assistant Store ──────────────────────────────────────────────────────────

interface MessageItem {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AssistantState {
  messages: MessageItem[];
  isTyping: boolean;
  send: (message: string) => Promise<void>;
  clearChat: () => void;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  messages: [],
  isTyping: false,

  send: async (message) => {
    const ts = Date.now();
    set({
      messages: [...get().messages, { role: "user", content: message, timestamp: ts }],
      isTyping: true,
    });
    try {
      const data = await authFetch<any>("/api/v1/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      const aiReply =
        typeof data === "string"
          ? data
          : data?.answer ?? data?.data?.answer ?? "I could not generate a response.";
      set({
        messages: [...get().messages, { role: "assistant", content: aiReply, timestamp: Date.now() }],
        isTyping: false,
      });
    } catch {
      const summary = useAnalyticsStore.getState().summary;
      const txCount = useTransactionStore.getState().transactions.length;
      set({
        messages: [
          ...get().messages,
          { role: "assistant", content: buildOfflineAnswer(message, summary, txCount), timestamp: Date.now() },
        ],
        isTyping: false,
      });
    }
  },

  clearChat: () => set({ messages: [], isTyping: false }),
}));

function buildOfflineAnswer(msg: string, s: FinanceSummary | null, txCount: number): string {
  if (!s) return "No financial data available yet. Add some transactions first.";
  const q = msg.toLowerCase();
  const ratio = s.income > 0 ? ((s.savings / s.income) * 100).toFixed(1) : "0";
  if (q.includes("health") || q.includes("score"))
    return `Your Financial Health Score is ${s.healthScore}/100. You are saving ${ratio}% of your income.`;
  if (q.includes("sav"))
    return `You have saved ₹${s.savings.toLocaleString()} — ${ratio}% of total income ₹${s.income.toLocaleString()}.`;
  if (q.includes("expense") || q.includes("spend"))
    return `Total expenses: ₹${s.expenses.toLocaleString()} across ${Object.keys(s.byCategory).length} categories.${Object.keys(s.byCategory).length > 0 ? " Highest: " + Object.entries(s.byCategory).sort((a, b) => b[1] - a[1])[0][0] : ""}`;
  if (q.includes("income") || q.includes("earn"))
    return `Recorded income: ₹${s.income.toLocaleString()}. After expenses of ₹${s.expenses.toLocaleString()}, savings: ₹${s.savings.toLocaleString()}.`;
  if (q.includes("categor") || q.includes("breakdown"))
    return Object.keys(s.byCategory).length === 0
      ? "No category data yet — add expenses to see breakdown."
      : `Spending breakdown: ${Object.entries(s.byCategory).map(([k, v]) => `${k} ₹${v.toLocaleString()}`).join(" | ")}`;
  return `Summary (${txCount} transactions): Income ₹${s.income.toLocaleString()} | Expenses ₹${s.expenses.toLocaleString()} | Savings ₹${s.savings.toLocaleString()} | Health ${s.healthScore}/100.`;
}

export const useGoalStore = create<{
  goals: { id: string; name: string; target: number; current: number }[];
  fetchGoals: () => Promise<void>;
}>((set) => ({
  goals: [],
  fetchGoals: async () => {
    try {
      const data = await authFetch<{ items: [] }>("/api/v1/goals");
      set({ goals: data.items || [] });
    } catch {
      set({ goals: [] });
    }
  },
}));