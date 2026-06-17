import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../../middleware/auth";

const router = Router();

router.get("/summary", requireAuth, (_req: AuthRequest, res: Response) => {
  return res.json({
    success: true,
    data: {
      income: 85000,
      expenses: 38500,
      savings: 46500,
      healthScore: 82,
      byCategory: {
        Food: 12000,
        Transport: 6500,
        Utilities: 4800,
        Healthcare: 3200,
        Entertainment: 5500,
        Education: 6500,
      },
    },
  });
});

export default router;
