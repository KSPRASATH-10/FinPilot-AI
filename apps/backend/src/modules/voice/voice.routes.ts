import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../../middleware/auth";
import fs from "fs";
import path from "path";

const router = Router();
const VALID_CATEGORIES = ["Food", "Transport", "Utilities", "Healthcare", "Entertainment", "Education", "General", "Income"];

// ─── POST /api/v1/voice/parse ─────────────────────────────────────────────────
// Body: { audioBase64: string }
// Returns: { intent: { amount, type, category, description, confidence } }

router.post("/parse", requireAuth, async (req: AuthRequest, res: Response) => {
  const tempFilePath = path.join(__dirname, `temp_${Date.now()}.m4a`);
  
  try {
    const GROQ_KEY = process.env.GROQ_API_KEY ?? "";
    const { audioBase64 } = req.body as { audioBase64?: string };

    if (!audioBase64) {
      return res.status(400).json({ success: false, error: { message: "audioBase64 is required" } });
    }

    if (!GROQ_KEY) {
      console.warn("[Voice] GROQ_API_KEY not set in environment");
      return res.status(500).json({ success: false, error: { message: "Groq credential layer missing" } });
    }

    // 1. Convert Base64 payload to local physical binary file
    fs.writeFileSync(tempFilePath, Buffer.from(audioBase64, "base64"));

    // 2. Transcribe Audio via Groq Whisper-Large Engine
    console.log("[Voice] Dispatched binary buffer stream to Groq Whisper matrix...");
    const formData = new FormData();
    formData.append("file", new Blob([fs.readFileSync(tempFilePath)]), "audio.m4a");
    formData.append("model", "whisper-large-v3");

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_KEY}` },
      body: formData as any,
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("[Voice] Groq Whisper error:", groqRes.status, errText);
      throw new Error(`Groq speech-to-text gateway failed with status ${groqRes.status}`);
    }

    const groqData = await groqRes.json() as any;
    const transcribedText = groqData.text || "";
    console.log(`[Voice] Transcribed Text: "${transcribedText}"`);

    // 3. Process transcription text using Groq's Llama 3.1 engine
    const today = new Date().toISOString().split("T")[0];
    console.log("[Voice] Routing structured analysis text to Groq Llama compiler...");
    
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
{"amount":number,"type":"expense|income","category":"Food|Transport|Utilities|Healthcare|Entertainment|Education|General|Income","description":"short description","confidence":"high|medium|low"}

Rules:
- amount must be positive. If unclear, set to 0.
- category must be one of the specified list.
Today's date: ${today}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!llamaRes.ok) {
      const errText = await llamaRes.text();
      console.error("[Voice] Groq Llama error:", llamaRes.status, errText);
      throw new Error(`Groq Llama text analysis layer failed with status ${llamaRes.status}`);
    }

    const llamaBody = await llamaRes.json() as any;
    const rawText = llamaBody?.choices?.[0]?.message?.content ?? "";
    console.log("[Voice] Analysis raw response:", rawText.slice(0, 200));
    
    // Extract JSON string safely from potential LLM text wrappers
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");

    if (start === -1 || end === -1) {
      console.warn("[Voice] No JSON layout bounds discovered in raw inference block");
      return res.json({ success: true, data: { intent: null, raw: rawText, reason: "Parsing anomaly" } });
    }

    const jsonSlice = rawText.substring(start, end + 1);
    const parsed = JSON.parse(jsonSlice);

    // Sanitize and map structural typing bounds
    const intent = {
      amount: Math.abs(Number(parsed.amount) || 0),
      type: parsed.type === "income" ? "income" : "expense",
      category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "General",
      description: String(parsed.description || "").trim().slice(0, 80),
      confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "high",
    };

    console.log("[Voice] Success! Parsed intent output:", JSON.stringify(intent));
    return res.json({ success: true, data: { intent, raw: rawText } });

  } catch (e: any) {
    console.error("[Voice] Execution Pipeline failure:", e.message);
    return res.status(500).json({ success: false, error: { message: e.message } });
  } finally {
    // Securely un-link local temporary file allocations from the filesystem disk
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
  }
});

export default router;