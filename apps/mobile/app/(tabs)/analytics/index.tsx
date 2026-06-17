import React, { useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Screen } from "../../../components/ui/Screen";
import { GlassCard } from "../../../components/ui/GlassCard";
import { useAnalyticsStore, useTransactionStore } from "../../../store/useFinanceStores";
import { useTheme } from "../../../theme/useTheme";

const PALETTE = ["#3D7FFF", "#A78BFA", "#22D3A0", "#FBBF24", "#F43F5E", "#38BDF8", "#FB923C"];

export default function AnalyticsScreen() {
  const T = useTheme();
  const { summary, recomputeSummary } = useAnalyticsStore();
  const transactions = useTransactionStore((s) => s.transactions);
  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => { recomputeSummary(); }, [transactions]);

  const onRefresh = async () => {
    setRefreshing(true);
    recomputeSummary();
    setRefreshing(false);
  };

  const hasData = summary && (summary.income > 0 || summary.expenses > 0);
  const categories = Object.entries(summary?.byCategory ?? {});
  const maxVal = categories.reduce((m, [, v]) => Math.max(m, v), 1);
  const rate = summary && summary.income > 0
    ? ((summary.savings / summary.income) * 100).toFixed(1)
    : "0";

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
        contentContainerStyle={{ paddingVertical: 20, gap: 16 }}
      >
        <Text style={[s.pageTitle, { color: T.text }]}>Analytics</Text>
        <Text style={[s.pageSub, { color: T.textSub }]}>Financial performance breakdown</Text>

        {!hasData ? (
          <GlassCard style={s.emptyState}>
            <Text style={s.emptyIcon}>📊</Text>
            <Text style={[s.emptyTitle, { color: T.text }]}>No data yet</Text>
            <Text style={[s.emptySub, { color: T.textSub }]}>
              Add income or expenses from the Home screen to see your analytics.
            </Text>
          </GlassCard>
        ) : (
          <>
            {/* Summary Row */}
            <View style={s.row}>
              {[
                { label: "Income", value: summary?.income, color: T.success, icon: "↑" },
                { label: "Expenses", value: summary?.expenses, color: T.danger, icon: "↓" },
                { label: "Savings", value: summary?.savings, color: T.accent, icon: "◎" },
              ].map((item) => (
                <GlassCard key={item.label} style={s.statCard}>
                  <Text style={[s.statIcon, { color: item.color }]}>{item.icon}</Text>
                  <Text style={[s.statLabel, { color: T.textSub }]}>{item.label}</Text>
                  <Text style={[s.statValue, { color: T.text }]}>
                    ₹{((item.value ?? 0) / 1000).toFixed(1)}K
                  </Text>
                </GlassCard>
              ))}
            </View>

            {/* Health Score */}
            <GlassCard>
              <View style={s.healthRow}>
                <View>
                  <Text style={[s.rateLabel, { color: T.textSub }]}>Health Score</Text>
                  <Text style={[s.rateValue, { color: T.accent }]}>{summary?.healthScore}/100</Text>
                </View>
                <Text style={[s.rateBadge, { color: (summary?.healthScore ?? 0) >= 75 ? T.success : T.warning }]}>
                  {(summary?.healthScore ?? 0) >= 75 ? "✓ Excellent" : (summary?.healthScore ?? 0) >= 50 ? "✓ Good" : "⚠ Needs Work"}
                </Text>
              </View>
              <View style={[s.progressBg, { backgroundColor: T.surfaceHigh }]}>
                <View style={[s.progressFill, { width: `${summary?.healthScore ?? 0}%`, backgroundColor: T.accent }]} />
              </View>
            </GlassCard>

            {/* Savings Rate */}
            {summary && summary.income > 0 && (
              <GlassCard>
                <View style={s.rateRow}>
                  <View>
                    <Text style={[s.rateLabel, { color: T.textSub }]}>Savings Rate</Text>
                    <Text style={[s.rateValue, { color: T.accent }]}>{rate}%</Text>
                  </View>
                  <Text style={[s.rateBadge, { color: Number(rate) >= 30 ? T.success : T.warning }]}>
                    {Number(rate) >= 30 ? "✓ On Target" : "⚠ Below 30%"}
                  </Text>
                </View>
                <View style={[s.progressBg, { backgroundColor: T.surfaceHigh }]}>
                  <View style={[s.progressFill, { width: `${Math.min(Number(rate), 100)}%`, backgroundColor: T.accent }]} />
                </View>
                <Text style={[s.rateHint, { color: T.textMuted }]}>Target: save at least 30% of income monthly</Text>
              </GlassCard>
            )}

            {/* Category Bars */}
            {categories.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { color: T.text }]}>Spending by Category</Text>
                <GlassCard noPad style={{ paddingVertical: 8 }}>
                  {categories.map(([cat, val], i) => (
                    <View key={cat} style={[s.catRow, { borderBottomColor: T.border, borderBottomWidth: i < categories.length - 1 ? 1 : 0 }]}>
                      <View style={[s.catDot, { backgroundColor: `${PALETTE[i % PALETTE.length]}22` }]}>
                        <Text style={{ fontSize: 12, color: PALETTE[i % PALETTE.length] }}>●</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={s.catLabelRow}>
                          <Text style={[s.catName, { color: T.text }]}>{cat}</Text>
                          <Text style={[s.catVal, { color: T.textSub }]}>₹{val.toLocaleString()}</Text>
                        </View>
                        <View style={[s.barBg, { backgroundColor: T.surfaceHigh }]}>
                          <View style={[s.barFill, { width: `${(val / maxVal) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }]} />
                        </View>
                      </View>
                    </View>
                  ))}
                </GlassCard>
              </>
            )}

            {/* Income vs Expense bar chart */}
            <Text style={[s.sectionTitle, { color: T.text }]}>Income vs Expense</Text>
            <GlassCard>
              <View style={s.compareRow}>
                {[
                  { label: "Income", val: summary?.income ?? 0, color: T.success },
                  { label: "Expenses", val: summary?.expenses ?? 0, color: T.danger },
                  { label: "Savings", val: summary?.savings ?? 0, color: T.accent },
                ].map((item) => {
                  const maxV = Math.max(summary?.income ?? 1, 1);
                  const h = Math.max(Math.round((item.val / maxV) * 100), 8);
                  return (
                    <View key={item.label} style={s.compareItem}>
                      <View style={[s.compareBar, { height: h, backgroundColor: item.color, width: 40, borderRadius: 8 }]} />
                      <Text style={[s.compareLabel, { color: T.textSub }]}>{item.label}</Text>
                      <Text style={[s.compareVal, { color: T.text }]}>₹{(item.val / 1000).toFixed(0)}K</Text>
                    </View>
                  );
                })}
              </View>
            </GlassCard>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  pageSub: { fontSize: 13, marginBottom: 4 },
  emptyState: { alignItems: "center", paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "800", marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  row: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 18, paddingHorizontal: 8 },
  statIcon: { fontSize: 20, marginBottom: 6 },
  statLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: "800" },
  healthRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  rateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  rateLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  rateValue: { fontSize: 36, fontWeight: "900", letterSpacing: -1 },
  rateBadge: { fontSize: 13, fontWeight: "700", marginTop: 6 },
  progressBg: { height: 8, borderRadius: 8, overflow: "hidden", marginBottom: 10 },
  progressFill: { height: 8, borderRadius: 8 },
  rateHint: { fontSize: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  catRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  catDot: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  catLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  catName: { fontSize: 14, fontWeight: "600" },
  catVal: { fontSize: 13, fontWeight: "600" },
  barBg: { height: 5, borderRadius: 5, overflow: "hidden" },
  barFill: { height: 5, borderRadius: 5 },
  compareRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", paddingTop: 10, minHeight: 120 },
  compareItem: { alignItems: "center", gap: 8 },
  compareBar: { minHeight: 8 },
  compareLabel: { fontSize: 11, fontWeight: "600" },
  compareVal: { fontSize: 13, fontWeight: "700" },
});