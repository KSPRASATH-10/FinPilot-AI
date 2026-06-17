import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "finpilot_dev_secret_change_in_prod";
const DEV_MODE = process.env.NODE_ENV !== "production";

export interface AuthRequest extends Request {
  user?: { id: string; email: string; isPro: boolean };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    if (DEV_MODE) {
      req.user = { id: "dev-user-001", email: "dev@finpilot.ai", isPro: false };
      return next();
    }
    return res.status(401).json({ success: false, error: { message: "UNAUTHENTICATED" } });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = { id: payload.sub ?? payload.id, email: payload.email, isPro: payload.isPro ?? false };
    next();
  } catch {
    if (DEV_MODE) {
      req.user = { id: "dev-user-001", email: "dev@finpilot.ai", isPro: false };
      return next();
    }
    return res.status(401).json({ success: false, error: { message: "INVALID_TOKEN" } });
  }
}

export function signToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}
