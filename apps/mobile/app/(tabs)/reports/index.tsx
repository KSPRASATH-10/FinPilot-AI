import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Screen } from "../../../components/ui/Screen";
import { GlassCard } from "../../../components/ui/GlassCard";
import { useAnalyticsStore, useTransactionStore } from "../../../store/useFinanceStores";
import { useAuthStore } from "../../../store/useAuthStore";
import { useTheme } from "../../../theme/useTheme";

type Scope = "weekly" | "monthly" | "quarterly";

const SCOPES: { key: Scope; label: string; icon: string }[] = [
  { key: "weekly", label: "Weekly", icon: "7D" },
  { key: "monthly", label: "Monthly", icon: "30D" },
  { key: "quarterly", label: "Quarterly", icon: "90D" },
];

function buildHTML(
  user: { name?: string; email?: string } | null,
  scope: Scope,
  summary: { income: number; expenses: number; savings: number; healthScore: number; byCategory: Record<string, number> } | null,
  transactions: { date: string; amount: number; category?: string; description?: string }[],
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  const scopeLabel = scope === "weekly" ? "Weekly" : scope === "monthly" ? "Monthly" : "Quarterly";

  const cutoff = new Date();
  if (scope === "weekly") cutoff.setDate(cutoff.getDate() - 7);
  else if (scope === "monthly") cutoff.setMonth(cutoff.getMonth() - 1);
  else cutoff.setMonth(cutoff.getMonth() - 3);

  const scopedTx = transactions.filter((tx) => new Date(tx.date) >= cutoff);

  const txRows = scopedTx
    .map(
      (tx) =>
        `<tr>
          <td>${new Date(tx.date).toLocaleDateString("en-IN")}</td>
          <td>${tx.description ?? tx.category ?? "—"}</td>
          <td>${tx.category ?? "—"}</td>
          <td style="color:#F43F5E;font-weight:700;">₹${tx.amount.toLocaleString()}</td>
        </tr>`,
    )
    .join("");

  const catRows = Object.entries(summary?.byCategory ?? {})
    .map(([k, v]) => `<tr><td>${k}</td><td style="font-weight:700;">₹${v.toLocaleString()}</td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 40px; background: #fff; color: #0D1B38; }
  .header { background: linear-gradient(135deg, #0D1B38, #1A2B55); color: white; padding: 32px; border-radius: 16px; margin-bottom: 32px; }
  .header h1 { margin: 0 0 6px; font-size: 28px; }
  .header p { margin: 0; opacity: 0.75; font-size: 13px; }
  .badge { display: inline-block; background: rgba(255,255,255,0.15); padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-top: 12px; }
  .summary { display: flex; gap: 16px; margin-bottom: 32px; }
  .stat { flex: 1; background: #F2F5FB; border-radius: 12px; padding: 20px; text-align: center; }
  .stat-label { font-size: 11px; color: #6B7280; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .stat-value { font-size: 24px; font-weight: 900; }
  .income { color: #059669; }
  .expense { color: #E11D48; }
  .savings { color: #2563EB; }
  .health { color: #7C3AED; }
  h2 { font-size: 16px; font-weight: 800; border-bottom: 2px solid #E5E7EB; padding-bottom: 10px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  th { background: #F2F5FB; padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6B7280; }
  td { padding: 10px 14px; border-bottom: 1px solid #F3F4F6; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  .footer { text-align: center; color: #9CA3AF; font-size: 11px; margin-top: 48px; }
</style>
</head>
<body>
  <div class="header">
    <h1>FinPilot Financial Report</h1>
    <p>${scopeLabel} Statement · Generated ${dateStr}</p>
    <p style="margin-top:8px;">Prepared for: <strong>${user?.name ?? "User"}</strong> · ${user?.email ?? ""}</p>
    <span class="badge">${scopeLabel.toUpperCase()} REPORT</span>
  </div>

  <div class="summary">
    <div class="stat"><div class="stat-label">Income</div><div class="stat-value income">₹${(summary?.income ?? 0).toLocaleString()}</div></div>
    <div class="stat"><div class="stat-label">Expenses</div><div class="stat-value expense">₹${(summary?.expenses ?? 0).toLocaleString()}</div></div>
    <div class="stat"><div class="stat-label">Savings</div><div class="stat-value savings">₹${(summary?.savings ?? 0).toLocaleString()}</div></div>
    <div class="stat"><div class="stat-label">Health Score</div><div class="stat-value health">${summary?.healthScore ?? 0}/100</div></div>
  </div>

  <h2>Spending by Category</h2>
  <table>
    <thead><tr><th>Category</th><th>Amount</th></tr></thead>
    <tbody>${catRows || "<tr><td colspan='2'>No data</td></tr>"}</tbody>
  </table>

  <h2>Transaction History (${scopeLabel})</h2>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
    <tbody>${txRows || "<tr><td colspan='4'>No transactions in this period</td></tr>"}</tbody>
  </table>

  <div class="footer">Generated by FinPilot AI · ${dateStr} · Confidential</div>
</body>
</html>`;
}

export default function ReportsScreen() {
  const T = useTheme();
  const user = useAuthStore((s) => s.user);
  const { summary, fetchSummary } = useAnalyticsStore();
  const { transactions, fetchTransactions } = useTransactionStore();
  const [scope, setScope] = useState<Scope>("monthly");
  const [generating, setGenerating] = useState(false);

  useEffect(() => { fetchSummary(); fetchTransactions(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const html = buildHTML(user, scope, summary, transactions);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Save or Share Report" });
      } else {
        Alert.alert("PDF Ready", `Saved to: ${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not generate PDF.");
    } finally {
      setGenerating(false);
    }
  };

  const cutoff = new Date();
  if (scope === "weekly") cutoff.setDate(cutoff.getDate() - 7);
  else if (scope === "monthly") cutoff.setMonth(cutoff.getMonth() - 1);
  else cutoff.setMonth(cutoff.getMonth() - 3);
  const scopedTxCount = transactions.filter((tx) => new Date(tx.date) >= cutoff).length;

  return (
    <Screen scroll>
      <Text style={[s.pageTitle, { color: T.text }]}>Reports</Text>
      <Text style={[s.pageSub, { color: T.textSub }]}>Generate & download financial statements</Text>

      {/* Scope Selector */}
      <Text style={[s.sectionLabel, { color: T.textMuted }]}>SELECT PERIOD</Text>
      <View style={s.scopeRow}>
        {SCOPES.map((sc) => (
          <TouchableOpacity
            key={sc.key}
            style={[
              s.scopeBtn,
              { borderColor: T.cardBorder, backgroundColor: T.card },
              scope === sc.key && { backgroundColor: T.accent, borderColor: T.accent },
            ]}
            onPress={() => setScope(sc.key)}
            activeOpacity={0.78}
          >
            <Text style={[s.scopeBadge, { color: scope === sc.key ? "#fff" : T.textMuted }]}>{sc.icon}</Text>
            <Text style={[s.scopeLabel, { color: scope === sc.key ? "#fff" : T.text }]}>{sc.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Preview Card */}
      <GlassCard style={s.previewCard}>
        <Text style={[s.previewTitle, { color: T.text }]}>Report Preview</Text>
        <View style={s.previewGrid}>
          {[
            { label: "Income", value: `₹${((summary?.income ?? 0) / 1000).toFixed(1)}K`, color: T.success },
            { label: "Expenses", value: `₹${((summary?.expenses ?? 0) / 1000).toFixed(1)}K`, color: T.danger },
            { label: "Savings", value: `₹${((summary?.savings ?? 0) / 1000).toFixed(1)}K`, color: T.accent },
            { label: "Health", value: `${summary?.healthScore ?? 0}/100`, color: T.accentAlt },
          ].map((item) => (
            <View key={item.label} style={[s.previewStat, { backgroundColor: `${item.color}11` }]}>
              <Text style={[s.previewStatVal, { color: item.color }]}>{item.value}</Text>
              <Text style={[s.previewStatLabel, { color: T.textMuted }]}>{item.label}</Text>
            </View>
          ))}
        </View>
        <View style={[s.divider, { backgroundColor: T.border }]} />
        <Text style={[s.previewMeta, { color: T.textSub }]}>
          Period: {SCOPES.find((s) => s.key === scope)?.label} · {scopedTxCount} transactions included
        </Text>
        <Text style={[s.previewMeta, { color: T.textSub }]}>
          Account: {user?.name ?? "User"} · {user?.email ?? ""}
        </Text>
      </GlassCard>

      {/* Generate Button */}
      <TouchableOpacity
        style={[s.generateBtn, { backgroundColor: T.accent }, generating && { opacity: 0.7 }]}
        onPress={handleGenerate}
        disabled={generating}
        activeOpacity={0.82}
      >
        {generating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={s.generateIcon}>📋</Text>
            <Text style={s.generateText}>Generate & Download PDF</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={[s.hint, { color: T.textMuted }]}>
        The PDF will open in your device's system share sheet for saving or sharing.
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 20 },
  pageSub: { fontSize: 13, marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10 },
  scopeRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  scopeBtn: { flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 16, borderWidth: 1.5, gap: 4 },
  scopeBadge: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  scopeLabel: { fontSize: 13, fontWeight: "700" },
  previewCard: { marginBottom: 24 },
  previewTitle: { fontSize: 16, fontWeight: "800", marginBottom: 16 },
  previewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  previewStat: { flex: 1, minWidth: "45%", borderRadius: 12, padding: 14, alignItems: "center" },
  previewStatVal: { fontSize: 18, fontWeight: "900", marginBottom: 4 },
  previewStatLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  divider: { height: 1, marginVertical: 14 },
  previewMeta: { fontSize: 12, marginBottom: 4 },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 18,
    gap: 10,
    shadowColor: "#3D7FFF",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 14,
  },
  generateIcon: { fontSize: 20 },
  generateText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  hint: { fontSize: 12, textAlign: "center", lineHeight: 18 },
});
