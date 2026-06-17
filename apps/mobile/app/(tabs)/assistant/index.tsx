import React, { useRef, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAssistantStore, useAnalyticsStore } from "../../../store/useFinanceStores";
import { useTheme } from "../../../theme/useTheme";

const SUGGESTIONS = [
  "What is my financial health score?",
  "Where am I spending the most?",
  "How much did I save this period?",
  "Break down my expenses by category",
];

export default function AssistantScreen() {
  const T = useTheme();
  const { messages, isTyping, send, clearChat } = useAssistantStore();
  const { fetchSummary } = useAnalyticsStore();
  const [input, setInput] = useState("");
  const listRef = useRef<FlatList>(null);

  useEffect(() => { fetchSummary(); }, []);
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await send(text);
  };

  const renderItem = ({ item }: { item: { role: string; content: string; timestamp: number } }) => {
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
          <Text style={[s.bubbleText, { color: isUser ? "#fff" : T.text }]}>
            {item.content}
          </Text>
          <Text style={[s.timestamp, { color: isUser ? "rgba(255,255,255,0.6)" : T.textMuted }]}>
            {new Date(item.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: T.bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Header */}
        <View style={[s.header, { borderBottomColor: T.border }]}>
          <View style={[s.headerIcon, { backgroundColor: `${T.accent}22` }]}>
            <Text style={[s.headerIconText, { color: T.accent }]}>✦</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: T.text }]}>FinPilot AI</Text>
            <Text style={[s.headerSub, { color: T.success }]}>● Online · Powered by AI</Text>
          </View>
          <TouchableOpacity onPress={clearChat} style={[s.clearBtn, { backgroundColor: T.card, borderColor: T.cardBorder }]}>
            <Text style={[s.clearText, { color: T.textSub }]}>Clear</Text>
          </TouchableOpacity>
        </View>

        {messages.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={[s.emptyIcon]}>✦</Text>
            <Text style={[s.emptyTitle, { color: T.text }]}>FinPilot AI Assistant</Text>
            <Text style={[s.emptySub, { color: T.textSub }]}>
              Ask me anything about your finances — spending patterns, savings goals, budget advice, or income analysis.
            </Text>
            <View style={s.suggestions}>
              {SUGGESTIONS.map((sg) => (
                <TouchableOpacity
                  key={sg}
                  style={[s.suggestionChip, { backgroundColor: T.card, borderColor: T.cardBorder }]}
                  onPress={() => { setInput(sg); }}
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

        {/* Input */}
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
  inputBar: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderTopWidth: 1, alignItems: "flex-end" },
  input: { flex: 1, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sendIcon: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
