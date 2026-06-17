import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { GlassCard } from "../ui/GlassCard";
import { useTheme } from "../../theme/useTheme";

interface Props {
  label: string;
  value: string;
  subtext?: string;
  color?: string;
  icon?: string;
}

export function MetricCard({ label, value, subtext, color, icon }: Props) {
  const T = useTheme();
  const accent = color ?? T.accent;
  return (
    <GlassCard style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: `${accent}22` }]}>
        <Text style={[styles.icon, { color: accent }]}>{icon ?? "💳"}</Text>
      </View>
      <Text style={[styles.label, { color: T.textSub }]}>{label}</Text>
      <Text style={[styles.value, { color: T.text }]}>{value}</Text>
      {subtext ? (
        <Text style={[styles.sub, { color: T.textMuted }]}>{subtext}</Text>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 145, margin: 5 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  icon: { fontSize: 18 },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4 },
  value: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  sub: { fontSize: 11, marginTop: 4 },
});
