import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, TextInput, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../../components/ui/Screen";
import { GlassCard } from "../../../components/ui/GlassCard";
import { MetricCard } from "../../../components/dashboard/MetricCard";
import { useAuthStore } from "../../../store/useAuthStore";
import { useAnalyticsStore, useTransactionStore } from "../../../store/useFinanceStores";
import { useTheme } from "../../../theme/useTheme";
import { DARK as DT } from "../../../theme";

const CATEGORIES = ["Food", "Transport", "Utilities", "Healthcare", "Entertainment", "Education", "General"];

export default function HomeScreen() {
  const T = useTheme();
  const user = useAuthStore((s) => s.user);
  const offlineMode = useAuthStore((s) => (s as any).offlineMode ?? false);
  const { summary, recomputeSummary } = useAnalyticsStore();
  const { transactions, addTransaction, fetchTransactions } = useTransactionStore();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [addType, setAddType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Food");

  // On every mount and whenever the logged-in user changes:
  // fetchTransactions() calls the backend, reads from disk for this user,
  // replaces Zustand state with real persisted data, then recomputes summary.
  // This is the single authoritative load point — fixes blank home after reload
  // and fixes cross-account data bleed on account switching.
  useEffect(() => {
    fetchTransactions();
  }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  };

  const handleAddEntry = () => {
    const amt = parseFloat(amount.replace(/,/g, ""));
    if (!amt || amt <= 0) { Alert.alert("Validation", "Enter a valid amount greater than 0."); return; }
    const desc = description.trim() || (addType === "income" ? "Income" : category);
    addTransaction({
      id: `manual_${Date.now()}`,
      date: new Date().toISOString(),
      amount: amt,
      category: addType === "income" ? "Income" : category,
      description: desc,
      type: addType,
    });
    setAddModal(false);
    setAmount("");
    setDescription("");
    setCategory("Food");
  };

  const fmt = (n: number) => `₹${(n / 1000).toFixed(1)}K`;
  const recent = transactions.slice(0, 5);
  const healthColor =
    (summary?.healthScore ?? 0) >= 75 ? T.success
    : (summary?.healthScore ?? 0) >= 50 ? T.warning
    : (summary?.healthScore ?? 0) > 0 ? T.danger
    : T.textMuted;

  const catIcon: Record<string, string> = {
    Food: "🍽️", Transport: "🚌", Utilities: "⚡", Healthcare: "💊",
    Entertainment: "🎬", Education: "📚", Income: "💰", General: "💳",
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
        contentContainerStyle={{ paddingVertical: 20 }}
      >
        {/* Offline banner */}
        {offlineMode && (
          <View style={[s.offlineBanner, { backgroundColor: `${T.warning}22`, borderColor: T.warning }]}>
            <Text style={[s.offlineText, { color: T.warning }]}>
              ⚡ Demo Mode — backend unreachable. Set EXPO_PUBLIC_API_URL to your machine's LAN IP.
            </Text>
          </View>
        )}

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={[s.greeting, { color: T.textSub }]}>Good day,</Text>
            <Text style={[s.name, { color: T.text }]}>{user?.name?.split(" ")[0] ?? "User"} 👋</Text>
          </View>
          <TouchableOpacity style={[s.notifBtn, { backgroundColor: T.card, borderColor: T.cardBorder }]}>
            <Text style={{ fontSize: 20 }}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Health Score */}
        <GlassCard style={[s.healthCard, { borderColor: `${healthColor}33` }]}>
          <View style={s.healthRow}>
            <View>
              <Text style={[s.healthLabel, { color: T.textSub }]}>Financial Health Score</Text>
              <Text style={[s.healthScore, { color: healthColor }]}>
                {summary && (summary.income > 0 || summary.expenses > 0) ? summary.healthScore : "--"}
                <Text style={s.healthMax}>/100</Text>
              </Text>
            </View>
            {summary && (summary.income > 0 || summary.expenses > 0) && (
              <View style={[s.scoreBadge, { backgroundColor: `${healthColor}22` }]}>
                <Text style={[s.scoreBadgeText, { color: healthColor }]}>
                  {(summary.healthScore) >= 75 ? "Excellent" : (summary.healthScore) >= 50 ? "Good" : "Needs Work"}
                </Text>
              </View>
            )}
          </View>
          <View style={[s.progressBg, { backgroundColor: T.surfaceHigh }]}>
            <View style={[s.progressFill, {
              width: `${summary && (summary.income > 0 || summary.expenses > 0) ? summary.healthScore : 0}%`,
              backgroundColor: healthColor,
            }]} />
          </View>
          {!(summary && (summary.income > 0 || summary.expenses > 0)) && (
            <Text style={[s.noDataHint, { color: T.textMuted }]}>Add income or expenses to see your health score</Text>
          )}
        </GlassCard>

        {/* Metric Grid */}
        <View style={s.metricGrid}>
          <MetricCard label="Income" value={fmt(summary?.income ?? 0)} icon="💰" color={T.success} subtext="This period" />
          <MetricCard label="Expenses" value={fmt(summary?.expenses ?? 0)} icon="💳" color={T.danger} subtext="Outflow" />
        </View>
        <View style={s.metricGrid}>
          <MetricCard
            label="Savings"
            value={fmt(summary?.savings ?? 0)}
            icon="🏦"
            color={T.accent}
            subtext={summary && summary.income > 0 ? `${((summary.savings / summary.income) * 100).toFixed(0)}% rate` : "Add income"}
          />
          <MetricCard
            label="Categories"
            value={String(Object.keys(summary?.byCategory ?? {}).length)}
            icon="📊"
            color={T.accentAlt}
            subtext="Tracked"
          />
        </View>

        {/* Add Entry Button */}
        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: T.accent }]}
          onPress={() => setAddModal(true)}
          activeOpacity={0.82}
        >
          <Text style={s.addBtnIcon}>＋</Text>
          <Text style={s.addBtnText}>Add Income / Expense</Text>
        </TouchableOpacity>

        {/* Quick Actions */}
        <Text style={[s.sectionTitle, { color: T.text }]}>Quick Actions</Text>
        <View style={s.actionRow}>
          {[
            { label: "Scan Bill", icon: "📷", route: "/scan" },
            { label: "Reports", icon: "📋", route: "/reports" },
            { label: "Settings", icon: "⚙️", route: "/settings" },
            { label: "FinPilot AI", icon: "✦", route: "/assistant" },
          ].map((a) => (
            <TouchableOpacity
              key={a.label}
              style={[s.actionBtn, { backgroundColor: T.card, borderColor: T.cardBorder }]}
              onPress={() => router.push(a.route as any)}
              activeOpacity={0.78}
            >
              <Text style={s.actionIcon}>{a.icon}</Text>
              <Text style={[s.actionLabel, { color: T.textSub }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Transactions */}
        <Text style={[s.sectionTitle, { color: T.text }]}>Recent Transactions</Text>
        <GlassCard noPad>
          {recent.length === 0 ? (
            <View style={s.emptyRow}>
              <Text style={[s.emptyText, { color: T.textMuted }]}>No transactions yet — tap + to add one</Text>
            </View>
          ) : (
            recent.map((tx, i) => (
              <View
                key={tx.id ?? i}
                style={[s.txRow, { borderBottomColor: T.border }, i === recent.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={[s.txDot, { backgroundColor: tx.type === "income" ? `${T.success}22` : T.accentGlow }]}>
                  <Text style={{ fontSize: 13 }}>{catIcon[tx.category ?? "General"] ?? "💳"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.txDesc, { color: T.text }]}>{tx.description ?? tx.category}</Text>
                  <Text style={[s.txDate, { color: T.textMuted }]}>
                    {new Date(tx.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} · {tx.category}
                  </Text>
                </View>
                <Text style={[s.txAmount, { color: tx.type === "income" ? T.success : T.danger }]}>
                  {tx.type === "income" ? "+" : "−"}₹{tx.amount.toLocaleString()}
                </Text>
              </View>
            ))
          )}
        </GlassCard>
      </ScrollView>

      {/* Add Income/Expense Modal */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: DT.bg, borderColor: DT.border }]}>
            <Text style={[s.modalTitle, { color: DT.text }]}>Add Entry</Text>

            {/* Type Toggle */}
            <View style={s.typeRow}>
              <TouchableOpacity
                style={[s.typeBtn, addType === "expense" && { backgroundColor: DT.danger }]}
                onPress={() => setAddType("expense")}
              >
                <Text style={[s.typeBtnText, { color: addType === "expense" ? "#fff" : DT.textSub }]}>Expense</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.typeBtn, addType === "income" && { backgroundColor: DT.success }]}
                onPress={() => { setAddType("income"); setCategory("Income"); }}
              >
                <Text style={[s.typeBtnText, { color: addType === "income" ? "#fff" : DT.textSub }]}>Income</Text>
              </TouchableOpacity>
            </View>

            {/* Amount */}
            <Text style={[s.fieldLabel, { color: DT.textSub }]}>Amount (₹)</Text>
            <TextInput
              style={[s.input, { backgroundColor: DT.inputBg, borderColor: DT.border, color: DT.text }]}
              placeholder="0"
              placeholderTextColor={DT.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />

            {/* Description */}
            <Text style={[s.fieldLabel, { color: DT.textSub }]}>Description (optional)</Text>
            <TextInput
              style={[s.input, { backgroundColor: DT.inputBg, borderColor: DT.border, color: DT.text }]}
              placeholder={addType === "income" ? "e.g. Salary, Freelance..." : "e.g. Groceries..."}
              placeholderTextColor={DT.textMuted}
              value={description}
              onChangeText={setDescription}
            />

            {/* Category (expenses only) */}
            {addType === "expense" && (
              <>
                <Text style={[s.fieldLabel, { color: DT.textSub }]}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[s.catChip, { borderColor: category === cat ? DT.accent : DT.border, backgroundColor: category === cat ? `${DT.accent}22` : DT.card }]}
                        onPress={() => setCategory(cat)}
                      >
                        <Text style={[s.catChipText, { color: category === cat ? DT.accent : DT.textSub }]}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Actions */}
            <TouchableOpacity
              style={[s.confirmModalBtn, { backgroundColor: addType === "income" ? DT.success : DT.accent }]}
              onPress={handleAddEntry}
              activeOpacity={0.82}
            >
              <Text style={s.confirmModalText}>Add {addType === "income" ? "Income" : "Expense"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.cancelModalBtn, { borderColor: DT.border }]}
              onPress={() => { setAddModal(false); setAmount(""); setDescription(""); }}
            >
              <Text style={[s.cancelModalText, { color: DT.textSub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  offlineBanner: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
  offlineText: { fontSize: 12, fontWeight: "600", lineHeight: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  greeting: { fontSize: 13, fontWeight: "500" },
  name: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  notifBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  healthCard: { marginBottom: 16 },
  healthRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  healthLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  healthScore: { fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  healthMax: { fontSize: 18, fontWeight: "400" },
  scoreBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  scoreBadgeText: { fontSize: 12, fontWeight: "700" },
  progressBg: { height: 6, borderRadius: 6, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 6 },
  noDataHint: { fontSize: 11, marginTop: 8 },
  metricGrid: { flexDirection: "row", marginBottom: 0 },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 16, paddingVertical: 14, gap: 10, marginTop: 16, marginBottom: 4,
    shadowColor: "#3D7FFF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  addBtnIcon: { color: "#fff", fontSize: 20, fontWeight: "700" },
  addBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  sectionTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3, marginTop: 24, marginBottom: 12 },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  actionBtn: { flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 16, borderWidth: 1, gap: 6 },
  actionIcon: { fontSize: 22 },
  actionLabel: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  txRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  txDot: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txDesc: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  txDate: { fontSize: 12 },
  txAmount: { fontSize: 14, fontWeight: "700" },
  emptyRow: { padding: 32, alignItems: "center" },
  emptyText: { fontSize: 14 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 28, paddingBottom: 40 },
  modalTitle: { fontSize: 22, fontWeight: "800", marginBottom: 20 },
  typeRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  typeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)" },
  typeBtnText: { fontSize: 14, fontWeight: "700" },
  fieldLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 16 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  catChipText: { fontSize: 13, fontWeight: "600" },
  confirmModalBtn: { borderRadius: 16, paddingVertical: 15, alignItems: "center", marginBottom: 10 },
  confirmModalText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelModalBtn: { borderRadius: 16, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  cancelModalText: { fontSize: 15, fontWeight: "600" },
});