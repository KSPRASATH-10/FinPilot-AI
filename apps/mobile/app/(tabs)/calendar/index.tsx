import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Screen } from "../../../components/ui/Screen";
import { GlassCard } from "../../../components/ui/GlassCard";
import { useTransactionStore } from "../../../store/useFinanceStores";
import { useTheme } from "../../../theme/useTheme";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function CalendarScreen() {
  const T = useTheme();
  const { transactions, fetchTransactions } = useTransactionStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());

  useEffect(() => { fetchTransactions(); }, []);

  const dailyMap = useMemo(() => {
    const map: Record<number, number> = {};
    transactions.forEach((tx) => {
      const d = new Date(tx.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        map[d.getDate()] = (map[d.getDate()] ?? 0) + tx.amount;
      }
    });
    return map;
  }, [transactions, year, month]);

  const selectedTxs = useMemo(() => {
    if (!selectedDay) return [];
    return transactions.filter((tx) => {
      const d = new Date(tx.date);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === selectedDay;
    });
  }, [transactions, selectedDay, year, month]);

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalMonthSpend = Object.values(dailyMap).reduce((a, b) => a + b, 0);
  const maxDay = Math.max(...Object.values(dailyMap), 1);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };

  const cells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const intensity = (spend: number) => {
    if (!spend) return "transparent";
    const pct = spend / maxDay;
    if (pct > 0.75) return `${T.danger}CC`;
    if (pct > 0.5) return `${T.danger}88`;
    if (pct > 0.25) return `${T.warning}66`;
    return `${T.accent}44`;
  };

  return (
    <Screen scroll>
      <Text style={[s.pageTitle, { color: T.text }]}>Calendar</Text>
      <Text style={[s.pageSub, { color: T.textSub }]}>Daily spending overview</Text>

      {/* Month Navigator */}
      <GlassCard style={s.navCard}>
        <TouchableOpacity onPress={prevMonth} style={s.navBtn}>
          <Text style={[s.navArrow, { color: T.accent }]}>‹</Text>
        </TouchableOpacity>
        <View style={s.navCenter}>
          <Text style={[s.monthLabel, { color: T.text }]}>
            {MONTHS[month]} {year}
          </Text>
          <Text style={[s.monthTotal, { color: T.danger }]}>
            ₹{totalMonthSpend.toLocaleString()} spent
          </Text>
        </View>
        <TouchableOpacity onPress={nextMonth} style={s.navBtn}>
          <Text style={[s.navArrow, { color: T.accent }]}>›</Text>
        </TouchableOpacity>
      </GlassCard>

      {/* Day Headers */}
      <View style={s.dayHeaders}>
        {DAYS.map((d) => (
          <Text key={d} style={[s.dayHeader, { color: T.textMuted }]}>{d}</Text>
        ))}
      </View>

      {/* Calendar Grid */}
      <GlassCard noPad style={[s.grid, { borderColor: T.cardBorder }]}>
        {cells.reduce<(number | null)[][]>((rows, cell, i) => {
          if (i % 7 === 0) rows.push([]);
          rows[rows.length - 1].push(cell);
          return rows;
        }, []).map((week, wi) => (
          <View key={wi} style={[s.week, wi > 0 && { borderTopColor: T.border, borderTopWidth: 1 }]}>
            {week.map((day, di) => {
              const spend = day ? (dailyMap[day] ?? 0) : 0;
              const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
              const isSelected = day === selectedDay;
              return (
                <TouchableOpacity
                  key={di}
                  style={[
                    s.dayCell,
                    di < 6 && { borderRightColor: T.border, borderRightWidth: 1 },
                    isSelected && { backgroundColor: `${T.accent}22` },
                  ]}
                  onPress={() => day && setSelectedDay(day)}
                  disabled={!day}
                  activeOpacity={0.7}
                >
                  {day ? (
                    <>
                      <View style={[
                        s.dayNum,
                        isToday && { backgroundColor: T.accent, borderRadius: 20 },
                      ]}>
                        <Text style={[
                          s.dayNumText,
                          { color: isToday ? "#fff" : T.text },
                          !spend && { opacity: 0.45 },
                        ]}>{day}</Text>
                      </View>
                      {spend > 0 && (
                        <>
                          <View style={[s.heatDot, { backgroundColor: intensity(spend) }]} />
                          <Text style={[s.spendLabel, { color: T.textMuted }]}>
                            {spend >= 1000 ? `${(spend / 1000).toFixed(1)}K` : spend}
                          </Text>
                        </>
                      )}
                    </>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </GlassCard>

      {/* Heat Legend */}
      <View style={s.legendRow}>
        <Text style={[s.legendLabel, { color: T.textMuted }]}>Spend intensity:</Text>
        {[T.accent + "44", T.warning + "66", T.danger + "88", T.danger + "CC"].map((c, i) => (
          <View key={i} style={[s.legendDot, { backgroundColor: c }]} />
        ))}
        <Text style={[s.legendLabel, { color: T.textMuted }]}>Low → High</Text>
      </View>

      {/* Selected Day Detail */}
      {selectedDay && (
        <>
          <Text style={[s.sectionTitle, { color: T.text }]}>
            {MONTHS[month]} {selectedDay} · Transactions
          </Text>
          {selectedTxs.length === 0 ? (
            <GlassCard style={s.emptyCard}>
              <Text style={[s.emptyText, { color: T.textMuted }]}>No transactions on this day</Text>
            </GlassCard>
          ) : (
            <GlassCard noPad>
              {selectedTxs.map((tx, i) => (
                <View key={tx.id ?? i} style={[
                  s.txRow,
                  { borderBottomColor: T.border },
                  i < selectedTxs.length - 1 && { borderBottomWidth: 1 },
                ]}>
                  <View style={[s.txDot, { backgroundColor: `${T.accent}22` }]}>
                    <Text style={{ fontSize: 14 }}>💳</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.txDesc, { color: T.text }]}>{tx.description ?? tx.category}</Text>
                    <Text style={[s.txCat, { color: T.textMuted }]}>{tx.category}</Text>
                  </View>
                  <Text style={[s.txAmt, { color: T.danger }]}>−₹{tx.amount.toLocaleString()}</Text>
                </View>
              ))}
            </GlassCard>
          )}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 20 },
  pageSub: { fontSize: 13, marginBottom: 16 },
  navCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 26, fontWeight: "700" },
  navCenter: { alignItems: "center" },
  monthLabel: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  monthTotal: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  dayHeaders: { flexDirection: "row", marginBottom: 4 },
  dayHeader: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  grid: { marginBottom: 10, overflow: "hidden" },
  week: { flexDirection: "row" },
  dayCell: { flex: 1, minHeight: 64, paddingTop: 6, alignItems: "center" },
  dayNum: { width: 26, height: 26, alignItems: "center", justifyContent: "center", marginBottom: 3 },
  dayNumText: { fontSize: 12, fontWeight: "700" },
  heatDot: { width: 22, height: 4, borderRadius: 2, marginBottom: 2 },
  spendLabel: { fontSize: 9, fontWeight: "600" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
  legendLabel: { fontSize: 11 },
  legendDot: { width: 14, height: 14, borderRadius: 4 },
  sectionTitle: { fontSize: 18, fontWeight: "800", marginBottom: 10 },
  emptyCard: { alignItems: "center" },
  emptyText: { fontSize: 14 },
  txRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  txDot: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  txDesc: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  txCat: { fontSize: 12 },
  txAmt: { fontSize: 14, fontWeight: "700" },
});
