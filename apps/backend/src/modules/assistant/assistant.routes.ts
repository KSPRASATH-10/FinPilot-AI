import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../../middleware/auth";

const router = Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";

async function callGemini(userMessage: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    console.error("[FinPilot AI] Missing GEMINI_API_KEY inside backend/.env configuration file.");
    throw new Error("No API key configured");
  }
  
  // Updated to standard stable v1 endpoint signature
// Swapping /v1/ over to /v1beta/ to support the gemini-1.5-flash engine model layout map
const targetUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";  

  const res = await fetch(`${targetUrl}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are FinPilot, a professional personal finance AI assistant. Provide concise, insightful, actionable financial advice. The user's financial context: Income ₹85,000 | Expenses ₹38,500 | Savings ₹46,500 | Health Score 82/100 | Top spending: Food ₹12,000, Transport ₹6,500, Utilities ₹4,800, Entertainment ₹5,500.\n\nUser query: ${userMessage}`,
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[GEMINI API GATEWAY ERROR]:", errText);
    throw new Error(`Gemini HTTP ${res.status}`);
  }

  // Explicitly casted body as any to bypass the TypeScript 'unknown' compiler error
  const body = await res.json() as any;
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response tree parsed from Google endpoint");
  return text;
}

function buildFallback(message: string): string {
  const q = message.toLowerCase();
  if (q.includes("health") || q.includes("score"))
    return "Your Financial Health Score is 82/100 — excellent. You are saving 54.7% of income. Key risks: Entertainment spend trending up. Recommendation: cap entertainment at ₹4,000/month and redirect ₹1,500 to emergency fund.";
  if (q.includes("sav"))
    return "You are saving ₹46,500 this period — a 54.7% savings rate, well above the 30% benchmark. To accelerate: automate a ₹5,000 SIP into a liquid mutual fund at month start before discretionary spending.";
  if (q.includes("expense") || q.includes("spend"))
    return "Total expenses: ₹38,500 across 6 categories. Food (₹12,000) is your highest outflow at 31% of spend. Consider meal planning to reduce by 15-20%. Entertainment (₹5,500) is the second area to audit — check for unused subscriptions.";
  if (q.includes("food") || q.includes("grocer"))
    return "Food spend: ₹12,000 — the largest single category at 31% of total expenses. Benchmark for your income bracket: ₹8,000-9,000. Estimated monthly saving potential: ₹3,000 via batch cooking, market buying and subscription audits.";
  if (q.includes("invest"))
    return "With a 54.7% savings rate, you have strong capacity to invest. Suggested allocation from ₹46,500 surplus: 40% into equity index funds, 30% into debt/liquid funds, 20% into emergency reserve, 10% into goal-specific savings. Review with a SEBI-registered advisor.";
  return `FinPilot Analysis: Income ₹85,000 | Expenses ₹38,500 | Savings ₹46,500 | Health 82/100. You have a strong financial position. Ask me about savings optimisation, expense reduction, investment strategy, or budget planning for targeted advice.`;
}

router.post("/chat", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ success: false, error: { message: "message is required" } });
    }

    let answer: string;
    try {
      answer = await callGemini(message);
    } catch (e: any) {
      console.warn("[ASSISTANT ROUTE] Gemini request failed, using server fallback logic.", e.message);
      answer = buildFallback(message);
    }

    return res.json({ success: true, data: { answer } });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: { message: e.message } });
  }
});

export default router;