import React from "react";
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView } from "react-native";
import { Screen } from "../../../components/ui/Screen";
import { GlassCard } from "../../../components/ui/GlassCard";
import { useSettingsStore } from "../../../store/useSettingsStore";
import { useTheme } from "../../../theme/useTheme";

type Theme = "dark" | "light" | "system";
type Language = "en" | "ta";

const LABELS: Record<string, Record<string, string>> = {
  en: {
    title: "Settings",
    subtitle: "Preferences & system configuration",
    appearance: "APPEARANCE",
    theme: "Theme",
    language: "LANGUAGE",
    privacy: "PRIVACY & SECURITY",
    notifications: "Push Notifications",
    biometrics: "Biometric Lock",
    currency: "CURRENCY",
    dark: "Dark",
    light: "Light",
    system: "System",
    english: "English",
    tamil: "தமிழ்",
  },
  ta: {
    title: "அமைப்புகள்",
    subtitle: "விருப்பத்தேர்வுகள் & கட்டமைப்பு",
    appearance: "தோற்றம்",
    theme: "கருப்பொருள்",
    language: "மொழி",
    privacy: "தனியுரிமை & பாதுகாப்பு",
    notifications: "அறிவிப்புகள்",
    biometrics: "உயிரியல் பூட்டு",
    currency: "நாணயம்",
    dark: "இருட்டு",
    light: "வெளிச்சம்",
    system: "கணினி",
    english: "English",
    tamil: "தமிழ்",
  },
};

export default function SettingsScreen() {
  const T = useTheme();
  const {
    theme, setTheme,
    language, setLanguage,
    notifications, setNotifications,
    biometrics, setBiometrics,
  } = useSettingsStore();

  const L = LABELS[language] ?? LABELS.en;

  const THEMES: { key: Theme; label: string }[] = [
    { key: "dark", label: L.dark },
    { key: "light", label: L.light },
    { key: "system", label: L.system },
  ];

  const LANGS: { key: Language; label: string }[] = [
    { key: "en", label: L.english },
    { key: "ta", label: L.tamil },
  ];

  return (
    <Screen scroll>
      <Text style={[s.pageTitle, { color: T.text }]}>{L.title}</Text>
      <Text style={[s.pageSub, { color: T.textSub }]}>{L.subtitle}</Text>

      {/* Theme */}
      <Text style={[s.sectionLabel, { color: T.textMuted }]}>{L.appearance}</Text>
      <GlassCard style={s.themeCard}>
        <Text style={[s.fieldLabel, { color: T.textSub }]}>{L.theme}</Text>
        <View style={s.segmentRow}>
          {THEMES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[
                s.segment,
                { borderColor: T.border, backgroundColor: T.card },
                theme === t.key && { backgroundColor: T.accent, borderColor: T.accent },
              ]}
              onPress={() => setTheme(t.key)}
              activeOpacity={0.78}
            >
              <Text style={[s.segmentText, { color: theme === t.key ? "#fff" : T.textSub }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </GlassCard>

      {/* Language */}
      <Text style={[s.sectionLabel, { color: T.textMuted }]}>{L.language}</Text>
      <GlassCard noPad>
        {LANGS.map((lg, i) => (
          <TouchableOpacity
            key={lg.key}
            style={[
              s.langRow,
              i < LANGS.length - 1 && { borderBottomColor: T.border, borderBottomWidth: 1 },
              language === lg.key && { backgroundColor: `${T.accent}0A` },
            ]}
            onPress={() => setLanguage(lg.key)}
            activeOpacity={0.78}
          >
            <Text style={[s.langLabel, { color: T.text }]}>{lg.label}</Text>
            {language === lg.key && (
              <View style={[s.checkBadge, { backgroundColor: T.accent }]}>
                <Text style={s.checkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </GlassCard>

      {/* Privacy & Security */}
      <Text style={[s.sectionLabel, { color: T.textMuted }]}>{L.privacy}</Text>
      <GlassCard noPad>
        <View style={[s.toggleRow, { borderBottomColor: T.border, borderBottomWidth: 1 }]}>
          <View>
            <Text style={[s.toggleLabel, { color: T.text }]}>{L.notifications}</Text>
            <Text style={[s.toggleSub, { color: T.textMuted }]}>Budget alerts & spending summaries</Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: T.surfaceHigh, true: `${T.accent}88` }}
            thumbColor={notifications ? T.accent : T.textMuted}
          />
        </View>
        <View style={s.toggleRow}>
          <View>
            <Text style={[s.toggleLabel, { color: T.text }]}>{L.biometrics}</Text>
            <Text style={[s.toggleSub, { color: T.textMuted }]}>Fingerprint or Face ID on launch</Text>
          </View>
          <Switch
            value={biometrics}
            onValueChange={setBiometrics}
            trackColor={{ false: T.surfaceHigh, true: `${T.accent}88` }}
            thumbColor={biometrics ? T.accent : T.textMuted}
          />
        </View>
      </GlassCard>

      {/* App Info */}
      <Text style={[s.sectionLabel, { color: T.textMuted }]}>ABOUT</Text>
      <GlassCard noPad>
        {[
          { label: "App Version", value: "1.0.0" },
          { label: "Build", value: "prod-2025" },
          { label: "Region", value: "IN" },
        ].map((row, i, arr) => (
          <View
            key={row.label}
            style={[
              s.infoRow,
              i < arr.length - 1 && { borderBottomColor: T.border, borderBottomWidth: 1 },
            ]}
          >
            <Text style={[s.infoLabel, { color: T.textMuted }]}>{row.label}</Text>
            <Text style={[s.infoValue, { color: T.text }]}>{row.value}</Text>
          </View>
        ))}
      </GlassCard>
    </Screen>
  );
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 20 },
  pageSub: { fontSize: 13, marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10, marginTop: 20 },
  themeCard: { marginBottom: 0 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 14 },
  segmentRow: { flexDirection: "row", gap: 8 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  segmentText: { fontSize: 13, fontWeight: "700" },
  langRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 16 },
  langLabel: { fontSize: 15, fontWeight: "600" },
  checkBadge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  checkText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 16 },
  toggleLabel: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  toggleSub: { fontSize: 12 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14 },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: "600" },
});
