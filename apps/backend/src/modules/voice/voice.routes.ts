import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../../middleware/auth";
import fs from "fs";
import path from "path";

const router = Router();
const VALID_CATEGORIES = ["Food", "Transport", "Utilities", "Healthcare", "Entertainment", "Education", "General", "Income"];

// 🌐 HELPER: Fetch Live Conversion Multipliers to base INR
async function convertToINR(amount: number, fromCurrency: string): Promise<{ inrAmount: number; currency: string }> {
  const symbolMap: Record<string, string> = {
    "$": "USD", "usd": "USD", "dollars": "USD", "dollar": "USD",
    "€": "EUR", "eur": "EUR", "euros": "EUR", "euro": "EUR",
    "£": "GBP", "gbp": "GBP", "pounds": "GBP",
    "₹": "INR", "inr": "INR", "rupees": "INR", "rupee": "INR"
  };

  const currencyCode = symbolMap[fromCurrency.toLowerCase().trim()] ?? "INR";
  if (currencyCode === "INR" || amount <= 0) {
    return { inrAmount: amount, currency: "INR" };
  }

  try {
    const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
    if (!API_KEY) {
      // Fallbacks if process env variables aren't hot-reloaded yet
      const staticRates: Record<string, number> = { "USD": 83.5, "EUR": 90.2, "GBP": 106.1 };
      return { inrAmount: amount * (staticRates[currencyCode] ?? 1), currency: currencyCode };
    }

    const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/pair/${currencyCode}/INR/${amount}`, {
      signal: AbortSignal.timeout(3000)
    });
    
    if (!res.ok) throw new Error();
    const data = await res.json() as any;
    return { inrAmount: Math.round(Number(data.conversion_result) || amount), currency: currencyCode };
  } catch {
    const staticRates: Record<string, number> = { "USD": 83.5, "EUR": 90.2, "GBP": 106.1 };
    return { inrAmount: amount * (staticRates[currencyCode] ?? 1), currency: currencyCode };
  }
}

router.post("/parse", requireAuth, async (req: AuthRequest, res: Response) => {
  const tempFilePath = path.join(__dirname, `temp_${Date.now()}.m4a`);
  
  try {
    const GROQ_KEY = process.env.GROQ_API_KEY ?? "";
    const { audioBase64 } = req.body as { audioBase64?: string };

    if (!audioBase64) {
      return res.status(400).json({ success: false, error: { message: "audioBase64 is required" } });
    }

    fs.writeFileSync(tempFilePath, Buffer.from(audioBase64, "base64"));

    const formData = new FormData();
    formData.append("file", new Blob([fs.readFileSync(tempFilePath)]), "audio.m4a");
    formData.append("model", "whisper-large-v3");

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_KEY}` },
      body: formData as any,
    });

    if (!groqRes.ok) throw new Error(`Groq transcription failed`);

    const groqData = await groqRes.json() as any;
    const transcribedText = groqData.text || "";
    console.log(`[Voice] Transcribed Text: "${transcribedText}"`);

    const today = new Date().toISOString().split("T")[0];
    
    const llamaRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "user",
            content: `You are a financial parsing agent. Extract transaction details from this text command: "${transcribedText}"
                  
Return ONLY a raw JSON object matching this structure (no code fences, no markdown formatting blocks, no conversations):
{"originalAmount":number,"currencySymbolOrCode":"string","type":"expense|income","category":"Food|Transport|Utilities|Healthcare|Entertainment|Education|General|Income","description":"short description","confidence":"high|medium|low"}

Rules:
- originalAmount must be positive.
- Identify currency identifiers (e.g., "$", "USD", "EUR", "Euros", "INR", "₹"). Default to "INR" if unspecified.
Today's date: ${today}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!llamaRes.ok) throw new Error(`Groq Llama processing failed`);

    const llamaBody = await llamaRes.json() as any;
    const rawText = llamaBody?.choices?.[0]?.message?.content ?? "";
    
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("JSON Parsing exception");

    const parsed = JSON.parse(rawText.substring(start, end + 1));

    // 💥 MULTI-CURRENCY CONVERSION PIPELINE ENGINE RUNTIME
    const detectedCurrency = parsed.currencySymbolOrCode || "INR";
    const rawAmt = Math.abs(Number(parsed.originalAmount) || 0);
    const conversion = await convertToINR(rawAmt, detectedCurrency);

    const intent = {
      amount: conversion.inrAmount, // Evaluated to functional base currency INR
      type: parsed.type === "income" ? "income" : "expense",
      category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "General",
      description: `${conversion.currency !== "INR" ? `[${rawAmt} ${conversion.currency}] ` : ""}${String(parsed.description || "").trim()}`.slice(0, 80),
      confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "high",
    };

    console.log("[Voice] Success! Converted intent output mapping:", JSON.stringify(intent));
    return res.json({ success: true, data: { intent, raw: rawText } });

  } catch (e: any) {
    console.error("[Voice Pipeline Failure]:", e.message);
    return res.status(500).json({ success: false, error: { message: e.message } });
  } finally {
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
  }
});

export default router;