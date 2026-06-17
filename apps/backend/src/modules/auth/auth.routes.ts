import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { signToken, requireAuth, AuthRequest } from "../../middleware/auth";

const router = Router();

// ─── Persistent user store ────────────────────────────────────────────────────
// Saved to data/users.json so accounts survive backend restarts (ctrl+c / npm run dev).
const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  isPro: boolean;
  createdAt: string;
}

function loadUsers(): Map<string, StoredUser> {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USERS_FILE)) return new Map();
    const raw = fs.readFileSync(USERS_FILE, "utf-8");
    const arr: StoredUser[] = JSON.parse(raw);
    const map = new Map<string, StoredUser>();
    arr.forEach((u) => map.set(u.email, u));
    return map;
  } catch {
    return new Map();
  }
}

function saveUsers(db: Map<string, StoredUser>): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify([...db.values()], null, 2), "utf-8");
  } catch (e: any) {
    console.error("[Auth] Failed to persist users:", e.message);
  }
}

// Load on startup
const DB = loadUsers();
console.log(`[Auth] Loaded ${DB.size} user(s) from ${USERS_FILE}`);

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, error: { message: "email, password and name are required" } });
    }
    const key = email.toLowerCase().trim();
    if (DB.has(key)) {
      return res.status(409).json({ success: false, error: { message: "Email already registered" } });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const id = `user_${Date.now()}`;
    const user: StoredUser = { id, name, email: key, passwordHash, isPro: false, createdAt: new Date().toISOString() };
    DB.set(key, user);
    saveUsers(DB);
    const accessToken = signToken({ sub: id, email: key, isPro: false });
    console.log(`[Auth] Registered: ${key}`);
    return res.status(201).json({
      success: true,
      data: { user: { id, name, email: key, isPro: false }, accessToken },
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: { message: "email and password are required" } });
    }
    const key = email.toLowerCase().trim();
    const user = DB.get(key);
    if (!user) {
      return res.status(401).json({ success: false, error: { message: "Invalid email or password" } });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: { message: "Invalid email or password" } });
    }
    const accessToken = signToken({ sub: user.id, email: key, isPro: user.isPro });
    console.log(`[Auth] Login: ${key}`);
    return res.json({
      success: true,
      data: { user: { id: user.id, name: user.name, email: user.email, isPro: user.isPro }, accessToken },
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.post("/forgot-password", async (req: Request, res: Response) => {
  const { email } = req.body;
  console.log(`[Auth] Password reset requested for: ${email}`);
  return res.json({ success: true, data: { message: "If this email is registered, a reset link has been sent." } });
});

router.delete("/delete-account", requireAuth, (req: AuthRequest, res: Response) => {
  const email = req.user?.email;
  if (email) {
    DB.delete(email);
    saveUsers(DB);
    console.log(`[Auth] Deleted account: ${email}`);
  }
  return res.json({ success: true, data: { message: "Account deleted" } });
});

export default router;