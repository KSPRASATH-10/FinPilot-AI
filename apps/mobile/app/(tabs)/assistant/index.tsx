import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Animated, Easing, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import * as FileSystem from "expo-file-system";
import { useAnalyticsStore } from "../../../store/useFinanceStores";
import { useAuthStore } from "../../../store/useAuthStore";
import { useTheme } from "../../../theme/useTheme";

const API_URL =
  (typeof globalThis !== "undefined" ? (globalThis as any).process?.env?.EXPO_PUBLIC_API_URL : undefined) ||
  "http://10.119.233.135:4000";

const SUGGESTIONS = [
  "What is my financial health score?",
  "Where am I spending the most?",
  "How much did I save this period?",
  "Break down my expenses by category",
];

type VoicePhase = "idle" | "recording" | "processing";

interface MessageItem {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// ─── Chunked TTS Queue ────────────────────────────────────────────────────────
// Splits text into sentence/clause chunks using punctuation delimiters, then
// feeds each chunk sequentially into expo-speech via the onDone callback chain.
// This prevents native TTS engines from truncating long or non-Latin responses.
function splitIntoSpeechChunks(text: string): string[] {
  if (!text.trim()) return [];

  // Split on sentence-ending punctuation, or logical clause boundaries.
  // The lookbehind keeps the delimiter attached to the preceding chunk.
  // Handles: . ! ? ; — and also comma-separated clauses for shorter pauses.
  const raw = text
    .split(/(?<=[.!?;])\s+|(?<=,)\s+(?=[A-Z\u0B80-\u0BFF\u0900-\u097F])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Merge very short fragments (< 8 chars) into the preceding chunk to avoid
  // the TTS engine firing for single words like "Yes." or "Ok."
  const merged: string[] = [];
  raw.forEach((chunk) => {
    if (merged.length > 0 && chunk.length < 8) {
      merged[merged.length - 1] += " " + chunk;
    } else {
      merged.push(chunk);
    }
  });

  return merged;
}

function speakChunked(
  text: string,
  options: { language?: string; pitch?: number; rate?: number } = {}
): void {
  // Stop any currently playing speech before starting a new one
  Speech.stop();

  const chunks = splitIntoSpeechChunks(text);
  if (chunks.length === 0) return;

  let index = 0;

  function speakNext() {
    if (index >= chunks.length) return;
    const chunk = chunks[index];
    index++;
    Speech.speak(chunk, {
      language: options.language ?? "en-IN",
      pitch: options.pitch ?? 1.0,
      rate: options.rate ?? 0.92,
      onDone: speakNext,
      onError: () => {
        // On error for a chunk, attempt the next one rather than stopping
        speakNext();
      },
    });
  }

  speakNext();
}

export default function AssistantScreen() {
  const T = useTheme();
  const router = useRouter();
  const token = useAuthStore((s) => s.user?.accessToken);
  const { fetchSummary } = useAnalyticsStore();

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState("");
  const listRef = useRef<FlatList>(null);

  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceReply, setVoiceReply] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/assistant/history`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const body = await res.json();
      const serverMessages: MessageItem[] = body?.data?.messages ?? [];
      setMessages(serverMessages);
    } catch {
      // Silent
    }
  }, [token]);

  useEffect(() => {
    fetchSummary();
    loadHistory();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");

    const userMsg: MessageItem = { role: "user", content: text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const res = await fetch(`${API_URL}/api/v1/assistant/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) throw new Error(`Server ${res.status}`);
      const body = await res.json();
      const answer: string = body?.data?.answer ?? "No response received.";
      const aiMsg: MessageItem = { role: "assistant", content: answer, timestamp: Date.now() };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Please check your network and try again.", timestamp: Date.now() },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearChat = async () => {
    setMessages([]);
    Speech.stop();
    try {
      await fetch(`${API_URL}/api/v1/assistant/history`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch { /* Silent */ }
  };

  function startPulse() {
    pulseAnim.setValue(1);
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  }

  function stopPulse() {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  }

  async function handleVoiceStart() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Microphone access is needed for voice chat.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setVoicePhase("recording");
      setVoiceReply(null);
      Speech.stop(); // stop any ongoing TTS before recording
      startPulse();
    } catch (e: any) {
      Alert.alert("Recording Error", e.message);
    }
  }

  async function handleVoiceStop() {
    stopPulse();
    setVoicePhase("processing");

    let uri: string | null = null;
    try {
      const rec = recordingRef.current;
      if (!rec) throw new Error("No active recording");
      recordingRef.current = null;
      await rec.stopAndUnloadAsync();
      uri = rec.getURI() ?? null;
      if (!uri) throw new Error("Recording URI not found");

      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const ext = uri.split(".").pop()?.toLowerCase() ?? "m4a";
      const mimeMap: Record<string, string> = {
        m4a: "audio/m4a", mp4: "audio/mp4", wav: "audio/wav",
        aac: "audio/aac", caf: "audio/x-caf",
      };
      const mimeType = mimeMap[ext] ?? "audio/m4a";

      const res = await fetch(`${API_URL}/api/v1/assistant/voice-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ audioBase64, mimeType }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const body = await res.json();
      const replyText: string = body?.data?.text ?? "I couldn't process that.";
      const transcription: string = body?.data?.transcription ?? "";

      setVoiceReply(replyText);

      // ── Chunked TTS — replaces single Speech.speak() call ──────────────
      // Detects language from transcription to select the correct TTS voice.
      // Tamil Unicode range: U+0B80–U+0BFF
      const isTamil = /[\u0B80-\u0BFF]/.test(transcription);
      const isHindi = /[\u0900-\u097F]/.test(transcription);
      const ttsLanguage = isTamil ? "ta-IN" : isHindi ? "hi-IN" : "en-IN";

      speakChunked(replyText, { language: ttsLanguage, pitch: 1.0, rate: 0.92 });

      if (transcription) {
        setMessages((prev) => [
          ...prev,
          { role: "user", content: `🎙️ ${transcription}`, timestamp: Date.now() },
          { role: "assistant", content: replyText, timestamp: Date.now() + 1 },
        ]);
      }
    } catch (e: any) {
      console.error("[VoiceChat]", e.message);
      Alert.alert("Voice Error", e.message);
    } finally {
      setVoicePhase("idle");
      if (uri) {
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* ignore */ }
      }
    }
  }

  const renderItem = ({ item }: { item: MessageItem }) => {
    const isUser = item.role === "user";
    return (
      <View style={[s.msgWrap, isUser ? s.userWrap : s.aiWrap]}>
        {!isUser && (
          <View style={[s.avatar, { backgroundColor: `${T.accent}22` }]}>
            <Text style={[s.avatarText, { color: T.accent }]}>✦</Text>
          </View>
        )}
        <View style={[
          s.bubble,
          isUser
            ? { backgroundColor: T.accent }
            : { backgroundColor: T.card, borderColor: T.cardBorder, borderWidth: 1 },
        ]}>
          <Text style={[s.bubbleText, { color: isUser ? "#fff" : T.text }]}>{item.content}</Text>
          <Text style={[s.timestamp, { color: isUser ? "rgba(255,255,255,0.6)" : T.textMuted }]}>
            {new Date(item.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    );
  };

  const voiceButtonLabel =
    voicePhase === "recording" ? "⏹ Stop" :
    voicePhase === "processing" ? "..." : "🎙️";

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: T.bg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>

        <View style={[s.header, { borderBottomColor: T.border }]}>
          <View style={[s.headerIcon, { backgroundColor: `${T.accent}22` }]}>
            <Text style={[s.headerIconText, { color: T.accent }]}>✦</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: T.text }]}>FinPilot AI</Text>
            <Text style={[s.headerSub, { color: T.success }]}>● Online · Groq Llama + Whisper</Text>
          </View>
          <TouchableOpacity onPress={handleClearChat} style={[s.clearBtn, { backgroundColor: T.card, borderColor: T.cardBorder }]}>
            <Text style={[s.clearText, { color: T.textSub }]}>Clear</Text>
          </TouchableOpacity>
        </View>

        {voiceReply && (
          <View style={[s.voiceReplyBanner, { backgroundColor: `${T.accent}18`, borderColor: `${T.accent}44` }]}>
            <Text style={s.voiceReplyIcon}>🔊</Text>
            <Text style={[s.voiceReplyText, { color: T.text }]} numberOfLines={3}>{voiceReply}</Text>
            <TouchableOpacity onPress={() => { setVoiceReply(null); Speech.stop(); }}>
              <Text style={[s.voiceReplyClose, { color: T.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {messages.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>✦</Text>
            <Text style={[s.emptyTitle, { color: T.text }]}>FinPilot AI Assistant</Text>
            <Text style={[s.emptySub, { color: T.textSub }]}>
              Ask me anything about your finances — or tap 🎙️ to speak your question aloud.
            </Text>
            <View style={s.suggestions}>
              {SUGGESTIONS.map((sg) => (
                <TouchableOpacity
                  key={sg}
                  style={[s.suggestionChip, { backgroundColor: T.card, borderColor: T.cardBorder }]}
                  onPress={() => setInput(sg)}
                  activeOpacity={0.78}
                >
                  <Text style={[s.suggestionText, { color: T.textSub }]}>{sg}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderItem}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {isTyping && (
          <View style={[s.typingRow, { backgroundColor: T.bg }]}>
            <View style={[s.avatar, { backgroundColor: `${T.accent}22` }]}>
              <Text style={[s.avatarText, { color: T.accent }]}>✦</Text>
            </View>
            <View style={[s.typingBubble, { backgroundColor: T.card, borderColor: T.cardBorder }]}>
              <ActivityIndicator size="small" color={T.accent} />
              <Text style={[s.typingText, { color: T.textSub }]}>Analysing your data...</Text>
            </View>
          </View>
        )}

        <View style={[s.inputBar, { backgroundColor: T.bg, borderTopColor: T.border }]}>
          <TextInput
            style={[s.input, { backgroundColor: T.inputBg, borderColor: T.border, color: T.text }]}
            placeholder="Ask about your finances..."
            placeholderTextColor={T.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <Animated.View style={{ transform: [{ scale: voicePhase === "recording" ? pulseAnim : new Animated.Value(1) }] }}>
            <TouchableOpacity
              style={[
                s.voiceBtn,
                {
                  backgroundColor: voicePhase === "recording" ? "#F43F5E" : voicePhase === "processing" ? T.surfaceHigh : `${T.accent}22`,
                  borderColor: voicePhase === "recording" ? "#F43F5E" : T.accent,
                },
              ]}
              onPress={voicePhase === "idle" ? handleVoiceStart : voicePhase === "recording" ? handleVoiceStop : undefined}
              disabled={voicePhase === "processing"}
              activeOpacity={0.82}
            >
              {voicePhase === "processing" ? (
                <ActivityIndicator size="small" color={T.accent} />
              ) : (
                <Text style={s.voiceBtnIcon}>{voiceButtonLabel}</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: input.trim() ? T.accent : T.surfaceHigh }]}
            onPress={handleSend}
            disabled={!input.trim() || isTyping}
            activeOpacity={0.82}
          >
            <Text style={s.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headerIconText: { fontSize: 20, fontWeight: "700" },
  headerTitle: { fontSize: 16, fontWeight: "800" },
  headerSub: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  clearText: { fontSize: 12, fontWeight: "600" },
  voiceReplyBanner: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 14, marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  voiceReplyIcon: { fontSize: 18 },
  voiceReplyText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "500" },
  voiceReplyClose: { fontSize: 16, paddingHorizontal: 4 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, color: "#3D7FFF", marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: "800", marginBottom: 10, textAlign: "center" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 28 },
  suggestions: { gap: 8, width: "100%" },
  suggestionChip: { padding: 14, borderRadius: 14, borderWidth: 1 },
  suggestionText: { fontSize: 14, fontWeight: "500" },
  listContent: { paddingHorizontal: 14, paddingVertical: 16, gap: 14 },
  msgWrap: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  userWrap: { justifyContent: "flex-end" },
  aiWrap: { justifyContent: "flex-start" },
  avatar: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  avatarText: { fontSize: 14, fontWeight: "800" },
  bubble: { maxWidth: "78%", borderRadius: 18, padding: 14 },
  bubbleText: { fontSize: 14, lineHeight: 22 },
  timestamp: { fontSize: 10, marginTop: 6, textAlign: "right" },
  typingRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, gap: 10 },
  typingBubble: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, borderWidth: 1 },
  typingText: { fontSize: 13 },
  inputBar: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10, gap: 8, borderTopWidth: 1, alignItems: "flex-end" },
  input: { flex: 1, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, maxHeight: 120 },
  voiceBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  voiceBtnIcon: { fontSize: 18 },
  sendBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sendIcon: { color: "#fff", fontSize: 18, fontWeight: "700" },
});