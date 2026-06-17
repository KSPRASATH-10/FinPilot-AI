import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../store/useAuthStore";
import { DARK as T } from "../../theme";

export default function RegisterScreen() {
  const register = useAuthStore((s) => s.register);
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert("Validation", "All fields are required.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Validation", "Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Validation", "Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await register(email.trim().toLowerCase(), password, name.trim());
      router.replace("/(tabs)/home");
    } catch (e: any) {
      Alert.alert("Registration Failed", e.message ?? "Could not create account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <View style={s.logoRow}>
            <Text style={s.logoIcon}>◈</Text>
            <Text style={s.logoText}>FinPilot</Text>
          </View>
          <Text style={s.headline}>Create account</Text>
          <Text style={s.sub}>Start your financial intelligence journey</Text>

          {[
            { label: "Full Name", value: name, set: setName, placeholder: "Jane Doe", type: "default" },
            { label: "Email", value: email, set: setEmail, placeholder: "you@example.com", type: "email-address" },
            { label: "Password", value: password, set: setPassword, placeholder: "Min. 6 characters", secure: true },
            { label: "Confirm Password", value: confirm, set: setConfirm, placeholder: "Repeat password", secure: true },
          ].map((f) => (
            <View style={s.fieldWrap} key={f.label}>
              <Text style={s.label}>{f.label}</Text>
              <TextInput
                style={s.input}
                placeholder={f.placeholder}
                placeholderTextColor={T.textMuted}
                value={f.value}
                onChangeText={f.set}
                secureTextEntry={f.secure}
                autoCapitalize={f.type === "email-address" ? "none" : "words"}
                keyboardType={(f.type as any) ?? "default"}
              />
            </View>
          ))}

          <TouchableOpacity style={s.btn} onPress={handleRegister} disabled={loading} activeOpacity={0.82}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create Account</Text>}
          </TouchableOpacity>

          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={s.backRow}>
              <Text style={s.backText}>Already have an account? <Text style={{ color: T.accent }}>Sign in</Text></Text>
            </TouchableOpacity>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  container: { flexGrow: 1, paddingHorizontal: 28, paddingVertical: 40 },
  logoRow: { flexDirection: "row", alignItems: "center", marginBottom: 36 },
  logoIcon: { fontSize: 32, color: T.accent, marginRight: 10 },
  logoText: { fontSize: 28, fontWeight: "800", color: T.text, letterSpacing: -0.5 },
  headline: { fontSize: 30, fontWeight: "800", color: T.text, letterSpacing: -0.8, marginBottom: 6 },
  sub: { fontSize: 14, color: T.textSub, marginBottom: 32 },
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
  btn: {
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
    shadowColor: T.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  backRow: { alignItems: "center" },
  backText: { color: T.textSub, fontSize: 14 },
});
