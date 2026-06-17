import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Modal, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../../components/ui/Screen";
import { GlassCard } from "../../../components/ui/GlassCard";
import { useAuthStore } from "../../../store/useAuthStore";
import { useTransactionStore, useAnalyticsStore, useAssistantStore } from "../../../store/useFinanceStores";
import { useTheme } from "../../../theme/useTheme";

// @ts-ignore
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://10.119.233.135:4000";

export default function ProfileScreen() {
  const T = useTheme();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const router = useRouter();
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const token = user?.accessToken;
      if (token) {
        await fetch(`${API_URL}/api/v1/auth/delete-account`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
    } finally {
      useTransactionStore.setState({ transactions: [] });
      useAnalyticsStore.setState({ summary: null });
      useAssistantStore.setState({ messages: [], isTyping: false });
      deleteAccount();
      setDeleting(false);
      setDeleteModal(false);
      router.replace("/(auth)/login");
    }
  };

  const initials = (user?.name ?? "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Screen scroll>
      <Text style={[s.pageTitle, { color: T.text }]}>Profile</Text>

      {/* Avatar */}
      <GlassCard style={s.avatarCard}>
        <View style={[s.avatar, { backgroundColor: `${T.accent}22` }]}>
          <Text style={[s.avatarText, { color: T.accent }]}>{initials}</Text>
        </View>
        <Text style={[s.userName, { color: T.text }]}>{user?.name ?? "User"}</Text>
        <Text style={[s.userEmail, { color: T.textSub }]}>{user?.email ?? ""}</Text>
        <View style={[s.tierBadge, { backgroundColor: user?.isPro ? `${T.accentAlt}22` : `${T.accent}18` }]}>
          <Text style={[s.tierText, { color: user?.isPro ? T.accentAlt : T.accent }]}>
            {user?.isPro ? "✦ PRO" : "FREE TIER"}
          </Text>
        </View>
      </GlassCard>

      {/* Account Info */}
      <Text style={[s.sectionLabel, { color: T.textMuted }]}>ACCOUNT INFORMATION</Text>
      <GlassCard noPad style={s.infoCard}>
        {[
          { label: "Full Name", value: user?.name ?? "—" },
          { label: "Email Address", value: user?.email ?? "—" },
          { label: "Department", value: user?.department ?? "General" },
          { label: "Account Plan", value: user?.isPro ? "Pro" : "Free" },
        ].map((row, i, arr) => (
          <View
            key={row.label}
            style={[s.infoRow, i < arr.length - 1 && { borderBottomColor: T.border, borderBottomWidth: 1 }]}
          >
            <Text style={[s.infoLabel, { color: T.textMuted }]}>{row.label}</Text>
            <Text style={[s.infoValue, { color: T.text }]}>{row.value}</Text>
          </View>
        ))}
      </GlassCard>

      {/* Actions */}
      <Text style={[s.sectionLabel, { color: T.textMuted }]}>ACCOUNT ACTIONS</Text>
      <GlassCard noPad>
        <TouchableOpacity
          style={[s.actionRow, { borderBottomColor: T.border, borderBottomWidth: 1 }]}
          onPress={() => router.push("/settings")}
          activeOpacity={0.78}
        >
          <Text style={s.actionIcon}>⚙️</Text>
          <Text style={[s.actionLabel, { color: T.text }]}>Settings & Preferences</Text>
          <Text style={[s.actionChev, { color: T.textMuted }]}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionRow, { borderBottomColor: T.border, borderBottomWidth: 1 }]}
          onPress={handleLogout}
          activeOpacity={0.78}
        >
          <Text style={s.actionIcon}>🚪</Text>
          <Text style={[s.actionLabel, { color: T.text }]}>Sign Out</Text>
          <Text style={[s.actionChev, { color: T.textMuted }]}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.actionRow}
          onPress={() => setDeleteModal(true)}
          activeOpacity={0.78}
        >
          <Text style={s.actionIcon}>🗑️</Text>
          <Text style={[s.actionLabel, { color: T.danger }]}>Delete Account & Wipe Data</Text>
          <Text style={[s.actionChev, { color: T.textMuted }]}>›</Text>
        </TouchableOpacity>
      </GlassCard>

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: T.bg, borderColor: T.border }]}>
            <Text style={[s.modalTitle, { color: T.danger }]}>Delete Account</Text>
            <Text style={[s.modalBody, { color: T.textSub }]}>
              This action is permanent and irreversible. All your financial data, transactions, and settings will be wiped immediately.
            </Text>
            <TouchableOpacity
              style={[s.modalDeleteBtn, { backgroundColor: T.danger }]}
              onPress={handleDeleteAccount}
              disabled={deleting}
              activeOpacity={0.82}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.modalDeleteText}>Yes, Delete Everything</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modalCancelBtn, { borderColor: T.border }]}
              onPress={() => setDeleteModal(false)}
              activeOpacity={0.78}
            >
              <Text style={[s.modalCancelText, { color: T.textSub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 20, marginBottom: 20 },
  avatarCard: { alignItems: "center", marginBottom: 24, paddingVertical: 28 },
  avatar: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  avatarText: { fontSize: 30, fontWeight: "800" },
  userName: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3, marginBottom: 4 },
  userEmail: { fontSize: 13, marginBottom: 14 },
  tierBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  tierText: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10, marginTop: 20 },
  infoCard: { marginBottom: 0 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14 },
  infoLabel: { fontSize: 13, fontWeight: "500" },
  infoValue: { fontSize: 14, fontWeight: "600" },
  actionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 16, gap: 14 },
  actionIcon: { fontSize: 20 },
  actionLabel: { flex: 1, fontSize: 15, fontWeight: "600" },
  actionChev: { fontSize: 20 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", borderRadius: 24, borderWidth: 1, padding: 28 },
  modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 12 },
  modalBody: { fontSize: 14, lineHeight: 22, marginBottom: 24 },
  modalDeleteBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", marginBottom: 12 },
  modalDeleteText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  modalCancelBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  modalCancelText: { fontSize: 15, fontWeight: "600" },
});
