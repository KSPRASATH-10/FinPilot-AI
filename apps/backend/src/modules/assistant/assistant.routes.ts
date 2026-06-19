import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../../middleware/auth";
import fs from "fs";
import path from "path";

const router = Router();

const TX_DIR   = path.join(process.cwd(), "data", "transactions");
const CHAT_DIR = path.join(process.cwd(), "data", "chats");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadUserTransactions(userId: string): any[] {
  try {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const file = path.join(TX_DIR, `${safe}.json`);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch { return []; }
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function chatFile(userId: string): string {
  ensureDir(CHAT_DIR);
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(CHAT_DIR, `${safe}.json`);
}

function loadHistory(userId: string): ChatMessage[] {
  try {
    const file = chatFile(userId);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf-8")) as ChatMessage[];
  } catch { return []; }
}

function saveHistory(userId: string, messages: ChatMessage[]): void {
  try {
    fs.writeFileSync(chatFile(userId), JSON.stringify(messages, null, 2), "utf-8");
  } catch (e: any) {
    console.error("[Chat] Failed to save history:", e.message);
  }
}

function appendToHistory(userId: string, userContent: string, assistantContent: string): void {
  const history = loadHistory(userId);
  const now = Date.now();
  history.push({ role: "user", content: userContent, timestamp: now });
  history.push({ role: "assistant", content: assistantContent, timestamp: now + 1 });
  saveHistory(userId, history);
}

// ─── TTS Normaliser ───────────────────────────────────────────────────────────
// Strips markdown symbols, emoji, currency glyphs, and erratic punctuation that
// cause native mobile TTS engines (expo-speech) to truncate or choke on
// non-Latin scripts like Tamil, Hindi, or Malayalam.
function normaliseForTTS(text: string): string {
  return text
    // Remove markdown headers
    .replace(/#{1,6}\s*/g, "")
    // Remove bold/italic markers
    .replace(/\*{1,3}(.*?)\*{1,3}/g, "$1")
    .replace(/_{1,2}(.*?)_{1,2}/g, "$1")
    // Remove inline code and code blocks
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // Remove markdown links — keep link text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove bullet/list markers
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // Remove blockquotes
    .replace(/^\s*>\s*/gm, "")
    // Remove horizontal rules
    .replace(/^---+$/gm, "")
    // Remove emoji (broad Unicode emoji ranges)
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]/gu, "")
    // Normalise rupee and currency symbols to spoken words
    .replace(/₹/g, " rupees ")
    .replace(/\$/g, " dollars ")
    .replace(/€/g, " euros ")
    // Collapse multiple spaces/newlines into single space
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    // Remove trailing/leading whitespace
    .trim();
}

async function searchWeb(query: string): Promise<string> {
  try {
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";
    if (!TAVILY_API_KEY || TAVILY_API_KEY === "tvly-your_key_here") return "";
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: TAVILY_API_KEY, query, search_depth: "basic", max_results: 2 }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return "";
    const data = await response.json() as any;
    return data.results.map((r: any) => `[Fact] ${r.title}: ${r.snippet}`).join("\n");
  } catch (err: any) {
    console.error("[Assistant] Tavily fetch failed:", err.message);
    return "";
  }
}

async function callGroqAssistant(
  userMessage: string,
  contextSummary: string,
  liveWebFacts: string,
  historyContext: { role: string; content: string }[]
): Promise<string> {
  const GROQ_KEY = process.env.GROQ_API_KEY ?? "";
  if (!GROQ_KEY) throw new Error("No GROQ_API_KEY configured");

  const systemPrompt = `You are FinPilot, a professional personal finance AI assistant. Provide concise, insightful, actionable financial advice based on the user's real account ledger data. Use clean markdown highlights for all values.

${contextSummary}

${liveWebFacts
    ? `REAL-TIME INTERNET CONTEXT:\n${liveWebFacts}`
    : "Note: Live web search is offline for this request. If the user asks for real-time stock quotes or news, explain you cannot query the live index right now."
  }

Rules:
- Do NOT make up financial details. Speak only using the live ledger metrics or real-time internet context above.
- Address the user directly. Keep financial tips practical, professional, and crisp.`;

  const historyMessages = historyContext.slice(-10).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const body = await res.json() as any;
  return body?.choices?.[0]?.message?.content ?? "Failed to parse completion.";
}

async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const GROQ_KEY = process.env.GROQ_API_KEY ?? "";
  if (!GROQ_KEY) throw new Error("No GROQ_API_KEY configured");

  const boundary = `----FinPilotBoundary${Date.now()}`;
  const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("webm") ? "webm" : "m4a";
  const filename = `audio.${ext}`;

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  );
  const modelPart = Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `whisper-large-v3\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
    `json\r\n` +
    `--${boundary}--\r\n`
  );

  const body = Buffer.concat([header, audioBuffer, modelPart]);

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whisper transcription failed ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as any;
  return (data.text ?? "").trim();
}

function buildContextSummary(userId: string): string {
  const transactions = loadUserTransactions(userId);
  let totalIncome = 0;
  let totalExpense = 0;
  const categories: Record<string, number> = {};

  transactions.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    if (tx.type === "income") {
      totalIncome += amt;
    } else {
      totalExpense += amt;
      categories[tx.category] = (categories[tx.category] || 0) + amt;
    }
  });

  const totalSavings = Math.max(0, totalIncome - totalExpense);
  let healthScore = 75;
  if (totalIncome > 0) {
    healthScore = Math.min(100, Math.floor((totalSavings / totalIncome) * 100 + 30));
  } else if (totalExpense > 0) {
    healthScore = 20;
  }

  const topCategoriesText = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cat, val]) => `${cat}: ₹${val}`)
    .join(", ") || "None recorded yet";

  return `User Current Financial Status (LIVE LEDGER):
- Total Income: ₹${totalIncome}
- Total Expenses: ₹${totalExpense}
- Projected Savings: ₹${totalSavings}
- Financial Health Score: ${healthScore}/100
- Category Breakdown: ${topCategoriesText}`;
}

function normaliseMime(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("mp4") || lower.includes("m4a") || lower.includes("mpeg")) return "audio/mp4";
  if (lower.includes("wav")) return "audio/wav";
  if (lower.includes("ogg")) return "audio/ogg";
  if (lower.includes("webm")) return "audio/webm";
  if (lower.includes("flac")) return "audio/flac";
  return "audio/mp4";
}

// ─── GET /api/v1/assistant/history ───────────────────────────────────────────
router.get("/history", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const history = loadHistory(userId);
  return res.json({ success: true, data: { messages: history } });
});

// ─── DELETE /api/v1/assistant/history ────────────────────────────────────────
router.delete("/history", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  saveHistory(userId, []);
  console.log(`[Chat] History cleared for user ${userId}`);
  return res.json({ success: true, data: { message: "Chat history cleared" } });
});

// ─── POST /api/v1/assistant/chat ─────────────────────────────────────────────
router.post("/chat", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ success: false, error: { message: "message is required" } });
    }

    const history = loadHistory(userId);

    const dynamicTriggers = [
      "cost today", "stock price", "price of", "today", "news", "market", "shares", "stock", "crypto",
      "spacex", "nvidia", "nvda", "apple", "aapl", "tesla", "tsla", "google", "goog", "microsoft", "msft",
    ];
    const needsWeb = dynamicTriggers.some((t) => message.toLowerCase().includes(t)) ||
      (message.trim().split(/\s+/).length <= 4 && /(nvidia|spacex|tesla|apple|google|stock|ticker)/i.test(message));

    let liveWebFacts = "";
    if (needsWeb) {
      console.log(`[Assistant] Web fetch triggered for: "${message}"`);
      liveWebFacts = await searchWeb(message);
    }

    const contextSummary = buildContextSummary(userId);
    const answer = await callGroqAssistant(message, contextSummary, liveWebFacts, history);
    appendToHistory(userId, message, answer);

    return res.json({ success: true, data: { answer } });
  } catch (e: any) {
    console.error("[Assistant Chat Error]:", e.message);
    return res.status(500).json({ success: false, error: { message: e.message } });
  }
});

// ─── POST /api/v1/assistant/voice-chat ───────────────────────────────────────
router.post("/voice-chat", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { audioBase64, mimeType } = req.body as { audioBase64?: string; mimeType?: string };

    if (!audioBase64) {
      return res.status(400).json({ success: false, error: { message: "audioBase64 is required" } });
    }

    const GROQ_KEY = process.env.GROQ_API_KEY ?? "";
    if (!GROQ_KEY) {
      return res.status(503).json({ success: false, error: { message: "GROQ_API_KEY not configured" } });
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");
    const resolvedMime = normaliseMime(mimeType ?? "audio/m4a");

    console.log(`[VoiceChat] Received ${audioBuffer.length} bytes, mime: ${resolvedMime}`);

    const transcription = await transcribeAudio(audioBuffer, resolvedMime);
    console.log(`[VoiceChat] Transcription: "${transcription}"`);

    if (!transcription) {
      return res.json({
        success: true,
        data: { text: "I couldn't hear that clearly. Could you try again?", transcription: "" },
      });
    }

    const contextSummary = buildContextSummary(userId);

    const voiceRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            // Voice system prompt explicitly forbids markdown since this text
            // goes to TTS — normaliseForTTS is a safety net on top of this.
            content: `You are FinPilot replying out loud via speaker audio. Keep your financial insight answers concise, practical, and under 2 sentences maximum. No markdown, no bullet points, no symbols — plain spoken language only. Do not use asterisks, hashes, backticks, or currency symbols. Say rupees in words.\n\n${contextSummary}`,
          },
          { role: "user", content: transcription },
        ],
        temperature: 0.3,
        max_tokens: 120,
      }),
    });

    if (!voiceRes.ok) throw new Error(`Groq voice-chat error: ${voiceRes.status}`);
    const voiceBody = await voiceRes.json() as any;
    const rawReply: string = voiceBody?.choices?.[0]?.message?.content ?? "I'm having trouble responding right now.";

    // Apply TTS normaliser — strips any residual markdown/emoji that break
    // native speech synthesis for Tamil and other non-Latin scripts.
    const replyText = normaliseForTTS(rawReply);

    console.log(`[VoiceChat] Raw reply: "${rawReply}"`);
    console.log(`[VoiceChat] Normalised for TTS: "${replyText}"`);

    appendToHistory(userId, `🎙️ ${transcription}`, replyText);

    return res.json({ success: true, data: { text: replyText, transcription } });
  } catch (e: any) {
    console.error("[VoiceChat Error]:", e.message);
    return res.status(500).json({ success: false, error: { message: e.message } });
  }
});

export default router;