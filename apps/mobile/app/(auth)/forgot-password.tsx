import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../store/useAuthStore";
import { DARK as T } from "../../theme";

export default function ForgotPasswordScreen() {
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert("Validation", "Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <Text style={s.back}>← </Text>
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={s.backRow}>
            <Text style={s.backText}>← Back to Sign In</Text>
          </TouchableOpacity>
        </Link>

        <Text style={s.headline}>Reset Password</Text>
        <Text style={s.sub}>
          Enter your registered email and we'll send a reset link.
        </Text>

        {sent ? (
          <View style={s.successBox}>
            <Text style={s.successIcon}>✉️</Text>
            <Text style={s.successTitle}>Email Sent</Text>
            <Text style={s.successSub}>
              If this email is registered, you will receive a reset link shortly. Check your inbox.
            </Text>
          </View>
        ) : (
          <>
            <View style={s.fieldWrap}>
              <Text style={s.label}>Email Address</Text>
              <TextInput
                style={s.input}
                placeholder="you@example.com"
                placeholderTextColor={T.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="send"
                onSubmitEditing={handleReset}
              />
            </View>
            <TouchableOpacity style={s.btn} onPress={handleReset} disabled={loading} activeOpacity={0.82}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Send Reset Link</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  container: { flex: 1, paddingHorizontal: 28, paddingTop: 20, justifyContent: "center" },
  back: { display: "none" },
  backRow: { marginBottom: 48 },
  backText: { color: T.accent, fontSize: 14, fontWeight: "600" },
  headline: { fontSize: 30, fontWeight: "800", color: T.text, letterSpacing: -0.8, marginBottom: 10 },
  sub: { fontSize: 14, color: T.textSub, marginBottom: 36, lineHeight: 22 },
  fieldWrap: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: "600", color: T.textSub, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" },
  input: {
    backgroundColor: T.inputBg,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: T.text,
  },
  btn: {
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    shadowColor: T.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  successBox: {
    backgroundColor: T.card,
    borderColor: T.success,
    borderWidth: 1,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
  },
  successIcon: { fontSize: 40, marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: "800", color: T.text, marginBottom: 10 },
  successSub: { fontSize: 14, color: T.textSub, textAlign: "center", lineHeight: 22 },
});
