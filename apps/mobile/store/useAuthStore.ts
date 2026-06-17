import { create } from "zustand";

export interface UserProfile {
  id?: string;
  name: string;
  email?: string;
  department?: string;
  institution?: string;
  batchTimeline?: string;
  isPro: boolean;
  tier: "FREE" | "PRO";
  accessToken?: string;
}

// ---------------------------------------------------------------------------
// API URL — set EXPO_PUBLIC_API_URL in .env to your machine's LAN IP, e.g.:
//   EXPO_PUBLIC_API_URL=http://192.168.1.42:4000
// If left unset or unreachable, offline demo mode kicks in automatically.
// ---------------------------------------------------------------------------
// @ts-ignore
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://10.119.233.135:4000";
// In-memory demo user store — used when the backend is unreachable
const DEMO_DB = new Map<string, { name: string; email: string; password: string }>();

function makeDemoToken(email: string) {
  return `demo_${btoa(email)}_${Date.now()}`;
}

async function tryFetch(url: string, opts: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

interface AuthState {
  user: UserProfile | null;
  offlineMode: boolean;
  setUser: (user: UserProfile) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  logout: () => void;
  deleteAccount: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  offlineMode: false,

  setUser: (user) => set({ user }),

  login: async (email, password) => {
    const key = email.toLowerCase().trim();

    // --- Try backend first ---
    try {
      const res = await tryFetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: key, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Login failed");
      const { user, accessToken } = body.data;
      set({
        offlineMode: false,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          department: user.department ?? "General",
          institution: user.institution ?? "",
          batchTimeline: user.batchTimeline ?? "",
          isPro: user.isPro ?? false,
          tier: user.isPro ? "PRO" : "FREE",
          accessToken,
        },
      });
      return;
    } catch (networkErr: any) {
      // If it's a server-side rejection (4xx), re-throw — don't fall to demo
      if (networkErr?.message && !networkErr.message.includes("Network") && !networkErr.message.includes("abort") && !networkErr.message.includes("fetch")) {
        throw networkErr;
      }
    }

    // --- Offline / demo fallback ---
    const demo = DEMO_DB.get(key);
    if (!demo) throw new Error("No account found. Please register first (demo mode is active — backend unreachable).");
    if (demo.password !== password) throw new Error("Incorrect password.");
    set({
      offlineMode: true,
      user: {
        id: `demo_${key}`,
        name: demo.name,
        email: key,
        department: "General",
        institution: "",
        batchTimeline: "",
        isPro: false,
        tier: "FREE",
        accessToken: makeDemoToken(key),
      },
    });
  },

  register: async (email, password, name) => {
    const key = email.toLowerCase().trim();

    // --- Try backend first ---
    try {
      const res = await tryFetch(`${API_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: key, password, name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Registration failed");
      const { user, accessToken } = body.data;
      set({
        offlineMode: false,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          department: "General",
          institution: "",
          batchTimeline: "",
          isPro: false,
          tier: "FREE",
          accessToken,
        },
      });
      return;
    } catch (networkErr: any) {
      if (networkErr?.message && !networkErr.message.includes("Network") && !networkErr.message.includes("abort") && !networkErr.message.includes("fetch")) {
        throw networkErr;
      }
    }

    // --- Offline / demo fallback ---
    if (DEMO_DB.has(key)) throw new Error("This email is already registered (demo mode).");
    DEMO_DB.set(key, { name, email: key, password });
    set({
      offlineMode: true,
      user: {
        id: `demo_${key}`,
        name,
        email: key,
        department: "General",
        institution: "",
        batchTimeline: "",
        isPro: false,
        tier: "FREE",
        accessToken: makeDemoToken(key),
      },
    });
  },

  forgotPassword: async (email) => {
    try {
      await tryFetch(`${API_URL}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Silently succeed in demo mode — UI shows "email sent" regardless
    }
  },

  logout: () => set({ user: null, offlineMode: false }),
  deleteAccount: () => set({ user: null, offlineMode: false }),
}));