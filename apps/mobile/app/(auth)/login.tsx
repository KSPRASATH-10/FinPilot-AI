import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../store/useAuthStore";
import { DARK as T } from "../../theme";

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Validation", "Please enter email and password.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      Alert.alert("Login Failed", e.message ?? "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.kav}>
        <View style={s.container}>
          <View style={s.logoRow}>
            <Text style={s.logoIcon}>◈</Text>
            <Text style={s.logoText}>FinPilot</Text>
          </View>
          <Text style={s.headline}>Welcome back</Text>
          <Text style={s.sub}>Sign in to your financial command centre</Text>

          <View style={s.form}>
            <View style={s.fieldWrap}>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                placeholder="you@example.com"
                placeholderTextColor={T.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>
            <View style={s.fieldWrap}>
              <Text style={s.label}>Password</Text>
              <TextInput
                style={s.input}
                placeholder="••••••••"
                placeholderTextColor={T.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>

            <Link href="/(auth)/forgot-password" asChild>
              <TouchableOpacity style={s.forgotRow}>
                <Text style={s.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            </Link>

            <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading} activeOpacity={0.82}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={s.divRow}>
              <View style={s.divLine} />
              <Text style={s.divLabel}>or</Text>
              <View style={s.divLine} />
            </View>

            <Link href="/(auth)/register" asChild>
              <TouchableOpacity style={s.outlineBtn} activeOpacity={0.82}>
                <Text style={s.outlineBtnText}>Create an account</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  kav: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 28, justifyContent: "center" },
  logoRow: { flexDirection: "row", alignItems: "center", marginBottom: 36 },
  logoIcon: { fontSize: 32, color: T.accent, marginRight: 10 },
  logoText: { fontSize: 28, fontWeight: "800", color: T.text, letterSpacing: -0.5 },
  headline: { fontSize: 32, fontWeight: "800", color: T.text, letterSpacing: -0.8, marginBottom: 6 },
  sub: { fontSize: 14, color: T.textSub, marginBottom: 36 },
  form: { gap: 0 },
  fieldWrap: { marginBottom: 16 },
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
  forgotRow: { alignSelf: "flex-end", marginBottom: 24 },
  forgotText: { fontSize: 13, color: T.accent, fontWeight: "600" },
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
    marginBottom: 20,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  divRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  divLine: { flex: 1, height: 1, backgroundColor: T.border },
  divLabel: { marginHorizontal: 12, color: T.textMuted, fontSize: 13 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: T.borderHigh,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
  },
  outlineBtnText: { color: T.text, fontSize: 16, fontWeight: "600" },
});
