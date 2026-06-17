import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../../middleware/auth";

const router = Router();

router.get("/", requireAuth, (_req: AuthRequest, res: Response) => {
  return res.json({ success: true, data: { reports: [] } });
});

export default router;
