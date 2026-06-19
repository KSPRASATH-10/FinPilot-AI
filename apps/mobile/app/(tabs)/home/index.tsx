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
import { VoiceEntryModal } from "../../../components/voice/VoiceEntryModal";

const CATEGORIES = ["Food", "Transport", "Utilities", "Healthcare", "Entertainment", "Education", "General"];

export default function HomeScreen() {
  const T = useTheme();
  const user = useAuthStore((s) => s.user);
  const offlineMode = useAuthStore((s) => (s as any).offlineMode ?? false);
  const { summary } = useAnalyticsStore();
  const { transactions, addTransaction, fetchTransactions } = useTransactionStore();
  const router = useRouter();
  
  const [refreshing, setRefreshing] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [voiceModal, setVoiceModal] = useState(false);
  const [addType, setAddType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Food");

  // Dynamic budget configurations tracking metrics
  const [allocatedBudget, setAllocatedBudget] = useState(30000); 
  const [budgetModal, setBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState("30000");

  // 🔄 LIFECYCLE: Synchronize data states from server endpoints dynamically
  useEffect(() => {
    async function loadDashboardAndBudget() {
      await fetchTransactions();
      
      try {
        const envUrl = typeof globalThis !== 'undefined' ? (globalThis as any).process?.env?.EXPO_PUBLIC_API_URL : undefined;
        const apiURL = envUrl || "http://10.0.2.2:4000";
        const token = (useAuthStore.getState() as any).token;
        
        const res = await fetch(`${apiURL}/api/v1/transactions`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const json = await res.json();
        
        if (json.success && json.data.budgetLimit) {
          setAllocatedBudget(json.data.budgetLimit);
          setBudgetInput(json.data.budgetLimit.toString());
        }
      } catch (err) {
        console.warn("[Budget Sync] Failed to retrieve server threshold metrics:", err);
      }
    }
    
    loadDashboardAndBudget();
  }, [user?.id, transactions.length]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  };

  // 💾 NETWORK HANDLER: Sync budget alterations directly into backend storage JSON files
  const handleSaveBudget = async () => {
    const numericBudget = parseFloat(budgetInput.replace(/,/g, ""));
    if (numericBudget && numericBudget > 0) {
      try {
        const envUrl = typeof globalThis !== 'undefined' ? (globalThis as any).process?.env?.EXPO_PUBLIC_API_URL : undefined;
        const apiURL = envUrl || "http://10.0.2.2:4000";
        const token = (useAuthStore.getState() as any).token;

        const res = await fetch(`${apiURL}/api/v1/transactions/budget`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ monthlyLimit: numericBudget })
        });
        
        const json = await res.json();
        if (json.success) {
          setAllocatedBudget(numericBudget);
          setBudgetModal(false);
          Alert.alert("Success", "Budget threshold synced securely across your devices!");
        } else {
          throw new Error();
        }
      } catch {
        setAllocatedBudget(numericBudget);
        setBudgetModal(false);
      }
    } else {
      Alert.alert("Invalid Metric", "Please submit a valid number format greater than 0.");
    }
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
  const currentExpenses = summary?.expenses ?? 0;
  const budgetUtilization = Math.min(100, Math.max(0, (currentExpenses / allocatedBudget) * 100));

  const healthColor =
    (summary?.healthScore ?? 0) >= 75 ? T.success
    : (summary?.healthScore ?? 0) >= 50 ? T.warning
    : (summary?.healthScore ?? 0) > 0 ? T.danger
    : T.textMuted;

  const catIcon: Record<string, string> = {
    Food: "🍽️", Transport: "🚌", Utilities: "⚡", Healthcare: "💊",
    Entertainment: "🎬", Education: "📚", Income: "💰", General: "💳",
  };

  const getInsightText = () => {
    if (currentExpenses === 0) return "No transaction outflows logged this cycle. Budget is healthy.";
    if (budgetUtilization > 90) return "⚠️ Action required: You've exhausted over 90% of your allocated budget.";
    if (budgetUtilization > 65) return "Notice: Outflows are expanding faster than the target threshold curves.";
    return "✓ Optimal status: Spend momentum remains locked securely within your safe savings bounds.";
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
        contentContainerStyle={{ paddingVertical: 20 }}
      >
        {offlineMode && (
          <View style={[styles.offlineBanner, { backgroundColor: `${T.warning}22`, borderColor: T.warning }]}>
            <Text style={[styles.offlineText, { color: T.warning }]}>
              ⚡ Demo Mode — backend unreachable. Set EXPO_PUBLIC_API_URL to your machine's LAN IP.
            </Text>
          </View>
        )}

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: T.textSub }]}>Good day,</Text>
            <Text style={[styles.name, { color: T.text }]}>{user?.name?.split(" ")[0] ?? "User"} 👋</Text>
          </View>
          <TouchableOpacity style={[styles.notifBtn, { backgroundColor: T.card, borderColor: T.cardBorder }]}>
            <Text style={{ fontSize: 20 }}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Health Score */}
        <GlassCard style={[styles.healthCard, { borderColor: `${healthColor}33` }]}>
          <View style={styles.healthRow}>
            <View>
              <Text style={[styles.healthLabel, { color: T.textSub }]}>Financial Health Score</Text>
              <Text style={[styles.healthScore, { color: healthColor }]}>
                {summary && (summary.income > 0 || summary.expenses > 0) ? summary.healthScore : "--"}
                <Text style={styles.healthMax}>/100</Text>
              </Text>
            </View>
            {summary && (summary.income > 0 || summary.expenses > 0) && (
              <View style={[styles.scoreBadge, { backgroundColor: `${healthColor}22` }]}>
                <Text style={[styles.scoreBadgeText, { color: healthColor }]}>
                  {(summary.healthScore) >= 75 ? "Excellent" : (summary.healthScore) >= 50 ? "Good" : "Needs Work"}
                </Text>
              </View>
            )}
          </View>
          <View style={[styles.progressBg, { backgroundColor: T.surfaceHigh }]}>
            <View style={[styles.progressFill, {
              width: `${summary && (summary.income > 0 || summary.expenses > 0) ? summary.healthScore : 0}%`,
              backgroundColor: healthColor,
            }]} />
          </View>
        </GlassCard>

        {/* MINI BUDGET PROGRESS CARD */}
        <GlassCard style={styles.miniBudgetCard}>
          <View style={styles.budgetHeaderRow}>
            <Text style={[styles.budgetLabel, { color: T.text }]}>Monthly Budget Context</Text>
            <Text style={[styles.budgetNumbers, { color: T.textSub }]}>
              ₹{currentExpenses.toLocaleString()} <Text style={{ fontSize: 11, color: T.textMuted }}>/ ₹{allocatedBudget.toLocaleString()}</Text>
            </Text>
          </View>
          
          <View style={[styles.progressBg, { backgroundColor: T.surfaceHigh, height: 4 }]}>
            <View style={[styles.progressFill, {
              width: `${budgetUtilization}%`,
              backgroundColor: budgetUtilization > 85 ? T.danger : budgetUtilization > 60 ? T.warning : T.accent
            }]} />
          </View>
          <View style={[styles.insightBadgeContainer, { backgroundColor: T.surface }]}>
            <Text style={[styles.insightMiniText, { color: T.textSub }]}>{getInsightText()}</Text>
          </View>
        </GlassCard>

        {/* Metric Grid */}
        <View style={styles.metricGrid}>
          <MetricCard label="Income" value={fmt(summary?.income ?? 0)} icon="💰" color={T.success} subtext="This period" />
          <MetricCard label="Expenses" value={fmt(summary?.expenses ?? 0)} icon="💳" color={T.danger} subtext="Outflow" />
        </View>
        <View style={styles.metricGrid}>
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

        {/* Add Entry Buttons Row */}
        <View style={styles.addRow}>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: T.accent, flex: 1 }]}
            onPress={() => setAddModal(true)}
            activeOpacity={0.82}
          >
            <Text style={styles.addBtnIcon}>＋</Text>
            <Text style={styles.addBtnText}>Add Entry</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addBtn, styles.voiceBtn, { borderColor: T.accent }]}
            onPress={() => setVoiceModal(true)}
            activeOpacity={0.82}
          >
            <Text style={styles.addBtnIcon}>🎙️</Text>
            <Text style={[styles.addBtnText, { color: T.accent }]}>Voice</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions Grid */}
        <Text style={[styles.sectionTitle, { color: T.text }]}>Quick Actions</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionScrollContainer}>
          {[
            { label: "Scan Bill", icon: "📷", type: "route", path: "/scan" },
            { label: "Set Budget", icon: "⚙️", type: "action", action: () => { setBudgetInput(allocatedBudget.toString()); setBudgetModal(true); } },
            { label: "Reports", icon: "📋", type: "route", path: "/reports" },
            { label: "FinPilot AI", icon: "✦", type: "route", path: "/(tabs)/assistant" },
          ].map((a) => (
            <TouchableOpacity
              key={a.label}
              style={[styles.actionBtn, { backgroundColor: T.card, borderColor: T.cardBorder }]}
              onPress={() => a.type === "route" ? router.push(a.path as any) : a.action?.()}
              activeOpacity={0.78}
            >
              <Text style={styles.actionIcon}>{a.icon}</Text>
              <Text style={[styles.actionLabel, { color: T.textSub }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Recent Transactions */}
        <Text style={[styles.sectionTitle, { color: T.text }]}>Recent Transactions</Text>
        <GlassCard noPad>
          {recent.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={[styles.emptyText, { color: T.textMuted }]}>No transactions yet — tap + to add one</Text>
            </View>
          ) : (
            recent.map((tx, i) => (
              <View
                key={tx.id ?? i}
                style={[styles.txRow, { borderBottomColor: T.border }, i === recent.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={[styles.txDot, { backgroundColor: tx.type === "income" ? `${T.success}22` : T.accentGlow }]}>
                  <Text style={{ fontSize: 13 }}>{catIcon[tx.category ?? "General"] ?? "💳"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txDesc, { color: T.text }]}>{tx.description ?? tx.category}</Text>
                  <Text style={[styles.txDate, { color: T.textMuted }]}>
                    {new Date(tx.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} · {tx.category}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: tx.type === "income" ? T.success : T.danger }]}>
                  {tx.type === "income" ? "+" : "−"}₹{tx.amount.toLocaleString()}
                </Text>
              </View>
            ))
          )}
        </GlassCard>
      </ScrollView>

      {/* Set Budget Modal */}
      <Modal visible={budgetModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: DT.bg, borderColor: DT.border }]}>
            <Text style={[styles.modalTitle, { color: DT.text }]}>Set Monthly Budget</Text>
            
            <Text style={[styles.fieldLabel, { color: DT.textSub }]}>Target Budget Limit (₹)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: DT.inputBg, borderColor: DT.border, color: DT.text }]}
              placeholder="e.g. 40000"
              placeholderTextColor={DT.textMuted}
              value={budgetInput}
              onChangeText={setBudgetInput}
              keyboardType="numeric"
            />

            <TouchableOpacity
              style={[styles.confirmModalBtn, { backgroundColor: DT.accent }]}
              onPress={handleSaveBudget}
              activeOpacity={0.82}
            >
              <Text style={styles.confirmModalText}>Save Budget</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.cancelModalBtn, { borderColor: DT.border }]}
              onPress={() => setBudgetModal(false)}
            >
              <Text style={[styles.cancelModalText, { color: DT.textSub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Manual Add Entry Modal */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: DT.bg, borderColor: DT.border }]}>
            <Text style={[styles.modalTitle, { color: DT.text }]}>Add Entry</Text>

            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, addType === "expense" && { backgroundColor: DT.danger }]}
                onPress={() => setAddType("expense")}
              >
                <Text style={[styles.typeBtnText, { color: addType === "expense" ? "#fff" : DT.textSub }]}>Expense</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, addType === "income" && { backgroundColor: DT.success }]}
                onPress={() => { setAddType("income"); setCategory("Income"); }}
              >
                <Text style={[styles.typeBtnText, { color: addType === "income" ? "#fff" : DT.textSub }]}>Income</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: DT.textSub }]}>Amount (₹)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: DT.inputBg, borderColor: DT.border, color: DT.text }]}
              placeholder="0"
              placeholderTextColor={DT.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />

            <Text style={[styles.fieldLabel, { color: DT.textSub }]}>Description (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: DT.inputBg, borderColor: DT.border, color: DT.text }]}
              placeholder={addType === "income" ? "e.g. Salary, Freelance..." : "e.g. Groceries..."}
              placeholderTextColor={DT.textMuted}
              value={description}
              onChangeText={setDescription}
            />

            {addType === "expense" && (
              <>
                <Text style={[styles.fieldLabel, { color: DT.textSub }]}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.catChip, { borderColor: category === cat ? DT.accent : DT.border, backgroundColor: category === cat ? `${DT.accent}22` : DT.card }]}
                        onPress={() => setCategory(cat)}
                      >
                        <Text style={[styles.catChipText, { color: category === cat ? DT.accent : DT.textSub }]}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            <TouchableOpacity
              style={[styles.confirmModalBtn, { backgroundColor: addType === "income" ? DT.success : DT.accent }]}
              onPress={handleAddEntry}
              activeOpacity={0.82}
            >
              <Text style={styles.confirmModalText}>Add {addType === "income" ? "Income" : "Expense"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelModalBtn, { borderColor: DT.border }]}
              onPress={() => { setAddModal(false); setAmount(""); setDescription(""); }}
            >
              <Text style={[styles.cancelModalText, { color: DT.textSub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <VoiceEntryModal
        visible={voiceModal}
        onClose={() => setVoiceModal(false)}
        onAdd={addTransaction}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  offlineBanner: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
  offlineText: { fontSize: 12, fontWeight: "600", lineHeight: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  greeting: { fontSize: 13, fontWeight: "500" },
  name: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  notifBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  healthCard: { marginBottom: 12 },
  healthRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  healthLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  healthScore: { fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  healthMax: { fontSize: 18, fontWeight: "400" },
  scoreBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  scoreBadgeText: { fontSize: 12, fontWeight: "700" },
  progressBg: { height: 6, borderRadius: 6, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 6 },
  
  miniBudgetCard: { padding: 16, marginBottom: 16 },
  budgetHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  budgetLabel: { fontSize: 13, fontWeight: "700", letterSpacing: -0.2 },
  budgetNumbers: { fontSize: 13, fontWeight: "700" },
  insightBadgeContainer: { marginTop: 12, padding: 10, borderRadius: 10 },
  insightMiniText: { fontSize: 11, fontWeight: "600", lineHeight: 15 },

  metricGrid: { flexDirection: "row", marginBottom: 0 },
  addRow: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 4 },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 16, paddingVertical: 14, gap: 8,
    shadowColor: "#3D7FFF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  voiceBtn: {
    flex: 0, paddingHorizontal: 20,
    backgroundColor: "rgba(61,127,255,0.12)",
    borderWidth: 1.5,
    shadowColor: "transparent", elevation: 0,
  },
  addBtnIcon: { color: "#fff", fontSize: 18, fontWeight: "700" },
  addBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  
  sectionTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3, marginTop: 24, marginBottom: 12 },
  
  actionScrollContainer: { flexDirection: "row", gap: 10, paddingRight: 16 },
  actionBtn: { width: 85, alignItems: "center", paddingVertical: 16, borderRadius: 16, borderWidth: 1, gap: 6 },
  actionIcon: { fontSize: 22 },
  actionLabel: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  
  txRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  txDot: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txDesc: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  txDate: { fontSize: 12 },
  txAmount: { fontSize: 14, fontWeight: "700" },
  emptyRow: { padding: 32, alignItems: "center" },
  emptyText: { fontSize: 14 },
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