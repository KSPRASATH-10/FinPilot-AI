import React, { useState, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  ScrollView,
  TextInput,
} from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { useAuthStore } from "../../store/useAuthStore";
import { TransactionItem } from "../../store/useFinanceStores";
import { DARK as T } from "../../theme";

// @ts-ignore
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://10.119.233.135:4000";

const VALID_CATEGORIES = ["Food", "Transport", "Utilities", "Healthcare", "Entertainment", "Education", "General"];

interface VoiceIntent {
  amount: number;
  type: "expense" | "income";
  category: string;
  description: string;
  confidence: "high" | "medium" | "low";
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (tx: TransactionItem) => void;
}

type Phase = "idle" | "recording" | "processing" | "review" | "error";

export function VoiceEntryModal({ visible, onClose, onAdd }: Props) {
  const token = useAuthStore((s) => s.user?.accessToken);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [intent, setIntent] = useState<VoiceIntent | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState("General");
  const [editType, setEditType] = useState<"expense" | "income">("expense");

  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  
  // 🔒 CRITICAL FIX: Direct hardware execution state lock parameter
  const isWorkingRef = useRef(false);

  // Clean up on close
  useEffect(() => {
    if (!visible) {
      stopPulse();
      safeStopRecording();
      setPhase("idle");
      setIntent(null);
      setErrorMsg("");
      isWorkingRef.current = false; // Reset lock on dismiss
    }
  }, [visible]);

  // ─── Pulse animation ─────────────────────────────────────────────────────────

  function startPulse() {
    pulseAnim.setValue(1);
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  }

  function stopPulse() {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  }

  // ─── Recording ───────────────────────────────────────────────────────────────

  async function safeStopRecording(): Promise<string | null> {
    try {
      const rec = recordingRef.current;
      if (!rec) return null;
      recordingRef.current = null;
      await rec.stopAndUnloadAsync();
      return rec.getURI() ?? null;
    } catch {
      return null;
    }
  }

  async function handleStartRecording() {
    if (isWorkingRef.current) return; // Drop rapid clicks
    isWorkingRef.current = true;

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Microphone access is needed to record voice commands.");
        isWorkingRef.current = false;
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setPhase("recording");
      startPulse();
    } catch (e: any) {
      setErrorMsg(`Could not start recording: ${e.message}`);
      setPhase("error");
    } finally {
      isWorkingRef.current = false;
    }
  }

  async function handleStopAndProcess() {
    if (isWorkingRef.current) return; // 🔒 DROP redundant audio parse dispatches instantly
    isWorkingRef.current = true;

    stopPulse();
    setPhase("processing");

    const uri = await safeStopRecording();
    if (!uri) {
      setErrorMsg("Recording file not found. Please try again.");
      setPhase("error");
      isWorkingRef.current = false;
      return;
    }

    try {
      // Read the audio file as base64
      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const ext = uri.split(".").pop()?.toLowerCase() ?? "m4a";
      const mimeMap: Record<string, string> = {
        m4a: "audio/m4a",
        mp4: "audio/mp4",
        aac: "audio/aac",
        wav: "audio/wav",
        caf: "audio/x-caf",
      };
      const mimeType = mimeMap[ext] ?? "audio/m4a";

      // POST to backend voice parser
      const res = await fetch(`${API_URL}/api/v1/voice/parse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ audioBase64, mimeType }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as any;
        throw new Error(errBody?.error?.message ?? `Server error ${res.status}`);
      }

      const body = await res.json() as any;
      const parsed: VoiceIntent | null = body?.data?.intent ?? null;

      if (!parsed || parsed.amount === 0) {
        setErrorMsg(
          parsed?.confidence === "low"
            ? "Could not understand the voice command clearly. Please speak louder and try again."
            : "No transaction amount detected. Please say something like 'Spent 200 on food'."
        );
        setPhase("error");
        return;
      }

      // Populate review form with parsed values
      setIntent(parsed);
      setEditAmount(String(parsed.amount));
      setEditDesc(parsed.description);
      setEditCategory(VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "General");
      setEditType(parsed.type === "income" ? "income" : "expense");
      setPhase("review");
    } catch (e: any) {
      console.error("[VoiceModal] Error:", e.message);
      setErrorMsg(`Processing failed: ${e.message}`);
      setPhase("error");
    } finally {
      isWorkingRef.current = false; // Release lock when transaction is ready for review
      // Clean up temp audio file
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* ignore */ }
    }
  }

  // ─── Confirm & add ───────────────────────────────────────────────────────────

  function handleConfirm() {
    const amt = parseFloat(editAmount.replace(/,/g, ""));
    if (!amt || amt <= 0) {
      Alert.alert("Validation", "Please enter a valid amount greater than 0.");
      return;
    }
    const tx: TransactionItem = {
      id: `voice_${Date.now()}`,
      date: new Date().toISOString(),
      amount: amt,
      category: editType === "income" ? "Income" : editCategory,
      description: editDesc.trim() || editCategory,
      type: editType,
    };
    onAdd(tx);
    onClose();
  }

  // ─── Render helpers ───────────────────────────────────────────────────────────

  const confidenceColor = intent?.confidence === "high" ? T.success : intent?.confidence === "medium" ? T.warning : T.danger;

  function renderIdle() {
    return (
      <View style={r.centerBlock}>
        <Text style={r.instructionTitle}>Voice Entry</Text>
        <Text style={r.instructionSub}>
          Tap the microphone and speak a transaction.{"\n"}
          <Text style={{ color: T.textMuted }}>e.g. "Spent 350 on groceries" or "Got salary of 40000"</Text>
        </Text>
        <TouchableOpacity style={r.micBtn} onPress={handleStartRecording} activeOpacity={0.82}>
          <Text style={r.micIcon}>🎙️</Text>
          <Text style={r.micLabel}>Tap to Record</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderRecording() {
    return (
      <View style={r.centerBlock}>
        <Text style={r.instructionTitle}>Listening...</Text>
        <Text style={r.instructionSub}>Speak your transaction clearly</Text>
        <Animated.View style={[r.pulseRing, { transform: [{ scale: pulseAnim }] }]}>
          <TouchableOpacity style={r.micBtnActive} onPress={handleStopAndProcess} activeOpacity={0.82}>
            <Text style={r.micIcon}>⏹</Text>
            <Text style={r.micLabelActive}>Tap to Stop</Text>
          </TouchableOpacity>
        </Animated.View>
        <Text style={[r.recordingHint, { color: T.danger }]}>● Recording in progress</Text>
      </View>
    );
  }

  function renderProcessing() {
    return (
      <View style={r.centerBlock}>
        <ActivityIndicator size="large" color={T.accent} />
        <Text style={[r.instructionTitle, { marginTop: 20 }]}>Analysing audio...</Text>
        <Text style={r.instructionSub}>Gemini is parsing your voice command</Text>
      </View>
    );
  }

  function renderReview() {
    return (
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={r.reviewHeader}>
          <Text style={r.reviewTitle}>Review & Confirm</Text>
          {intent?.confidence && (
            <View style={[r.confBadge, { backgroundColor: `${confidenceColor}22` }]}>
              <Text style={[r.confText, { color: confidenceColor }]}>
                {intent.confidence === "high" ? "✓ High confidence" : intent.confidence === "medium" ? "~ Medium" : "⚠ Low confidence"}
              </Text>
            </View>
          )}
        </View>

        {/* Type toggle */}
        <View style={r.typeRow}>
          <TouchableOpacity
            style={[r.typeBtn, editType === "expense" && { backgroundColor: T.danger }]}
            onPress={() => setEditType("expense")}
          >
            <Text style={[r.typeBtnText, { color: editType === "expense" ? "#fff" : T.textSub }]}>Expense</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[r.typeBtn, editType === "income" && { backgroundColor: T.success }]}
            onPress={() => setEditType("income")}
          >
            <Text style={[r.typeBtnText, { color: editType === "income" ? "#fff" : T.textSub }]}>Income</Text>
          </TouchableOpacity>
        </View>

        {/* Amount */}
        <Text style={r.fieldLabel}>Amount (₹)</Text>
        <TextInput
          style={r.input}
          value={editAmount}
          onChangeText={setEditAmount}
          keyboardType="numeric"
          placeholderTextColor={T.textMuted}
          placeholder="0"
          selectionColor={T.accent}
        />

        {/* Description */}
        <Text style={r.fieldLabel}>Description</Text>
        <TextInput
          style={r.input}
          value={editDesc}
          onChangeText={setEditDesc}
          placeholderTextColor={T.textMuted}
          placeholder="What was this for?"
          selectionColor={T.accent}
        />

        {/* Category (expense only) */}
        {editType === "expense" && (
          <>
            <Text style={r.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {VALID_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[r.catChip, {
                      borderColor: editCategory === cat ? T.accent : T.border,
                      backgroundColor: editCategory === cat ? `${T.accent}22` : T.card,
                    }]}
                    onPress={() => setEditCategory(cat)}
                  >
                    <Text style={[r.catChipText, { color: editCategory === cat ? T.accent : T.textSub }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        <TouchableOpacity style={r.confirmBtn} onPress={handleConfirm} activeOpacity={0.82}>
          <Text style={r.confirmText}>✓ Add Transaction</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={r.retryBtn}
          onPress={() => { setPhase("idle"); setIntent(null); }}
          activeOpacity={0.78}
        >
          <Text style={[r.retryText, { color: T.textSub }]}>🎙️ Record Again</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  function renderError() {
    return (
      <View style={r.centerBlock}>
        <Text style={{ fontSize: 44, marginBottom: 16 }}>⚠️</Text>
        <Text style={[r.instructionTitle, { color: T.danger }]}>Could not parse</Text>
        <Text style={[r.instructionSub, { color: T.textSub }]}>{errorMsg}</Text>
        <TouchableOpacity style={[r.micBtn, { backgroundColor: `${T.accent}22`, marginTop: 28 }]} onPress={() => setPhase("idle")} activeOpacity={0.82}>
          <Text style={r.micIcon}>🎙️</Text>
          <Text style={[r.micLabel, { color: T.accent }]}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={r.overlay}>
        <View style={r.sheet}>
          <View style={r.handle} />
          <TouchableOpacity style={r.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={r.closeText}>✕</Text>
          </TouchableOpacity>

          {phase === "idle" && renderIdle()}
          {phase === "recording" && renderRecording()}
          {phase === "processing" && renderProcessing()}
          {phase === "review" && renderReview()}
          {phase === "error" && renderError()}
        </View>
      </View>
    </Modal>
  );
}

const r = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0D1221",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 28,
    paddingBottom: 44,
    minHeight: 380,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center", marginBottom: 20,
  },
  closeBtn: {
    position: "absolute", top: 20, right: 24,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  closeText: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "700" },
  centerBlock: { alignItems: "center", paddingTop: 12, paddingBottom: 8 },
  instructionTitle: { fontSize: 22, fontWeight: "800", color: T.text, marginBottom: 10, textAlign: "center" },
  instructionSub: { fontSize: 14, color: T.textSub, textAlign: "center", lineHeight: 22, marginBottom: 32 },
  micBtn: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: `${T.accent}22`,
    borderWidth: 2, borderColor: T.accent,
    alignItems: "center", justifyContent: "center", gap: 6,
  },
  micBtnActive: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: T.danger,
    alignItems: "center", justifyContent: "center", gap: 6,
  },
  micIcon: { fontSize: 36 },
  micLabel: { fontSize: 12, fontWeight: "700", color: T.accent },
  micLabelActive: { fontSize: 12, fontWeight: "700", color: "#fff" },
  pulseRing: {
    width: 110, height: 110, borderRadius: 55,
    shadowColor: T.danger, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 20, elevation: 10,
  },
  recordingHint: { fontSize: 13, fontWeight: "600", marginTop: 24 },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  reviewTitle: { fontSize: 20, fontWeight: "800", color: T.text },
  confBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  confText: { fontSize: 11, fontWeight: "700" },
  typeRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  typeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)" },
  typeBtnText: { fontSize: 14, fontWeight: "700" },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: T.textSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  input: {
    backgroundColor: T.inputBg, borderColor: T.border, borderWidth: 1,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: T.text, marginBottom: 16,
  },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  catChipText: { fontSize: 13, fontWeight: "600" },
  confirmBtn: {
    backgroundColor: T.accent, borderRadius: 16, paddingVertical: 15,
    alignItems: "center", marginBottom: 12,
    shadowColor: T.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 14, elevation: 8,
  },
  confirmText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  retryBtn: { borderRadius: 16, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: T.border },
  retryText: { fontSize: 14, fontWeight: "600" },
});