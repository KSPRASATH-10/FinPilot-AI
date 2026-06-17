import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ScrollView, ActivityIndicator, Alert, Platform
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Screen } from "../../../components/ui/Screen";
import { GlassCard } from "../../../components/ui/GlassCard";
import { useTransactionStore } from "../../../store/useFinanceStores";
import { useAuthStore } from "../../../store/useAuthStore";
import { useTheme } from "../../../theme/useTheme";

// @ts-ignore
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://10.119.233.135:4000";

interface ExtractedItem {
  name: string;
  amount: number;
  category: string;
}

interface OCRResult {
  items: ExtractedItem[];
  total: number;
  merchant?: string;
  date?: string;
}

export default function ScanScreen() {
  const T = useTheme();
  const user = useAuthStore((s) => s.user);
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  const requestAndPick = async (useCamera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true
    };

    const res = useCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (res.canceled || !res.assets?.[0]?.uri) return;

    const uri = res.assets[0].uri;
    setImageUri(uri);
    setResult(null);
    setSelectedItems(new Set());
    await processImageJsonBody(uri);
  };

  const processImageJsonBody = async (uri: string) => {
    setProcessing(true);
    try {
      const token = user?.accessToken;
      
      // Convert image data straight to high-speed string base64 packets
      const b64Data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const fileExt = uri.split('.').pop() || "jpeg";

      const res = await fetch(`${API_URL}/api/v1/bills/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          imageBase64: b64Data,
          mimeType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`
        }),
      });

      if (!res.ok) throw new Error("Server pipeline rejected photo payload");
      const body = await res.json();
      const ocrResult: OCRResult = body.data;

      if (!ocrResult || !ocrResult.items || ocrResult.items.length === 0) {
        throw new Error("Zero valid items returned from parser runtime.");
      }

      setResult(ocrResult);
      setSelectedItems(new Set(ocrResult.items.map((_, i) => i)));
    } catch (err: any) {
      console.error("[JSON VISION UPLOAD ERROR]:", err.message);
      Alert.alert("⚠️ Extraction Failed", "Could not parse clear text line structures from this receipt image layout.");
      setImageUri(null);
    } finally {
      setProcessing(false);
    }
  };

  const toggleItem = (i: number) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!result) return;
    let addedCount = 0;
    result.items.forEach((item, i) => {
      if (selectedItems.has(i)) {
        addTransaction({
          id: `scan_${Date.now()}_${i}`,
          date: result.date || new Date().toISOString(),
          amount: item.amount,
          category: item.category,
          description: item.name,
          type: "expense"
        });
        addedCount++;
      }
    });
    Alert.alert("✓ Expense Linked", `${addedCount} transaction rows synced inside your financial dynamic ledger views.`);
    setImageUri(null);
    setResult(null);
  };

  const handleReset = () => {
    setImageUri(null);
    setResult(null);
    setSelectedItems(new Set());
  };

  const selectedTotal = result
    ? result.items.filter((_, i) => selectedItems.has(i)).reduce((s, it) => s + it.amount, 0)
    : 0;

  return (
    <Screen scroll>
      <Text style={[s.pageTitle, { color: T.text }]}>Bill Scanner</Text>
      <Text style={[s.pageSub, { color: T.textSub }]}>Scan or upload a receipt to extract expenses</Text>

      {/* Choose Source Layout Card */}
      {!imageUri && (
        <GlassCard style={s.pickCard}>
          <Text style={[s.pickPrompt, { color: T.text }]}>Choose image source</Text>
          <Text style={[s.pickSub, { color: T.textSub }]}>
            Point at a receipt, bill, or invoice and FinPilot AI will extract all line items automatically.
          </Text>
          <View style={s.pickRow}>
            <TouchableOpacity style={[s.pickBtn, { backgroundColor: T.accent }]} onPress={() => requestAndPick(true)} activeOpacity={0.82}>
              <Text style={s.pickBtnIcon}>📷</Text>
              <Text style={s.pickBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.pickBtn, { backgroundColor: T.card, borderColor: T.border, borderWidth: 1 }]} onPress={() => requestAndPick(false)} activeOpacity={0.82}>
              <Text style={s.pickBtnIcon}>🖼️</Text>
              <Text style={[s.pickBtnText, { color: T.text }]}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
      )}

      {/* Active Capture Preview Wrapper */}
      {imageUri && (
        <GlassCard noPad style={s.imageCard}>
          <Image source={{ uri: imageUri }} style={s.previewImage} resizeMode="cover" />
          <View style={[s.imageOverlay, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
            {processing ? (
              <View style={s.processingRow}>
                <ActivityIndicator color={T.accent} size="large" />
                <Text style={s.processingText}>Extracting line items...</Text>
              </View>
            ) : (
              <TouchableOpacity style={s.retakeBtn} onPress={handleReset} activeOpacity={0.78}>
                <Text style={s.retakeBtnText}>✕ Retake</Text>
              </TouchableOpacity>
            )}
          </View>
        </GlassCard>
      )}

      {/* Dynamic Token Output Checkboxes Layer */}
      {result && !processing && (
        <>
          <GlassCard style={s.billSummary}>
            <View style={s.billHeaderRow}>
              {/* Wraps vendor text attributes within flexible, contractible margins */}
              <View style={s.merchantContainer}>
                <Text style={[s.merchantName, { color: T.text }]} numberOfLines={2}>
                  {result.merchant ?? "Receipt"}
                </Text>
                {result.date && (
                  <Text style={[s.billDate, { color: T.textSub }]}>
                    {new Date(result.date).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}
                  </Text>
                )}
              </View>
              {/* Flexible layout badge layer preserves currency presentation */}
              <View style={[s.totalBadge, { backgroundColor: `${T.danger}18` }]}>
                <Text style={[s.totalBadgeLabel, { color: T.textMuted }]}>TOTAL</Text>
                <Text style={[s.totalBadgeVal, { color: T.danger }]} numberOfLines={1}>
                  ₹{result.total.toLocaleString()}
                </Text>
              </View>
            </View>
          </GlassCard>

          <Text style={[s.sectionLabel, { color: T.textMuted }]}>EXTRACTED LINE ITEMS — tap to toggle</Text>
          <GlassCard noPad>
            {result.items.map((item, i) => {
              const sel = selectedItems.has(i);
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    s.itemRow,
                    i < result.items.length - 1 && { borderBottomColor: T.border, borderBottomWidth: 1 },
                    sel && { backgroundColor: `${T.accent}0A` },
                  ]}
                  onPress={() => toggleItem(i)}
                  activeOpacity={0.78}
                >
                  <View style={[
                    s.checkbox,
                    { borderColor: sel ? T.accent : T.border, backgroundColor: sel ? T.accent : "transparent" },
                  ]}>
                    {sel && <Text style={s.checkmark}>✓</Text>}
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[s.itemName, { color: sel ? T.text : T.textSub }]} numberOfLines={2}>{item.name}</Text>
                    <View style={[s.catPill, { backgroundColor: `${T.accentAlt}18` }]}>
                      <Text style={[s.catPillText, { color: T.accentAlt }]}>{item.category}</Text>
                    </View>
                  </View>
                  <Text style={[s.itemAmt, { color: sel ? T.danger : T.textMuted }]} numberOfLines={1}>
                    ₹{item.amount.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </GlassCard>

          <GlassCard style={s.selSummary}>
            <Text style={[s.selLabel, { color: T.textSub }]}>
              {selectedItems.size} of {result.items.length} items selected
            </Text>
            <Text style={[s.selTotal, { color: T.text }]} numberOfLines={1}>
              ₹{selectedTotal.toLocaleString()}
            </Text>
          </GlassCard>

          <TouchableOpacity
            style={[s.confirmBtn, { backgroundColor: T.success }, selectedItems.size === 0 && { opacity: 0.4 }]}
            onPress={handleConfirm}
            disabled={selectedItems.size === 0}
            activeOpacity={0.82}
          >
            <Text style={s.confirmIcon}>✓</Text>
            <Text style={s.confirmText}>Confirm & Add to Expenses</Text>
          </TouchableOpacity>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 20 },
  pageSub: { fontSize: 13, marginBottom: 20 },
  pickCard: { alignItems: "center", paddingVertical: 36 },
  pickPrompt: { fontSize: 20, fontWeight: "800", marginBottom: 10, textAlign: "center" },
  pickSub: { fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 28, paddingHorizontal: 10 },
  pickRow: { flexDirection: "row", gap: 14, width: "100%" },
  pickBtn: { flex: 1, alignItems: "center", paddingVertical: 18, borderRadius: 16, gap: 8 },
  pickBtnIcon: { fontSize: 28 },
  pickBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  imageCard: { marginBottom: 16, overflow: "hidden" },
  previewImage: { width: "100%", height: 220 },
  imageOverlay: { position: "absolute", top: 0, left: 0, right: 0, height: 220, alignItems: "center", justifyContent: "center" },
  processingRow: { alignItems: "center", gap: 14 },
  processingText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  retakeBtn: { position: "absolute", top: 12, right: 12, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  retakeBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  billSummary: { marginBottom: 16 },
  
  // ⚡ STYLING FIXES FOR OVERFLOW PREVENTION
  billHeaderRow: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    width: "100%",
    gap: 8 
  },
  merchantContainer: { 
    flex: 1, 
    marginRight: 4 
  },
  merchantName: { fontSize: 18, fontWeight: "800", marginBottom: 4, lineHeight: 24 },
  billDate: { fontSize: 13 },
  totalBadge: { 
    alignItems: "flex-end", 
    justifyContent: "center",
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 12,
    minWidth: 100,
    maxWidth: "40%"
  },
  totalBadgeLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 2 },
  totalBadgeVal: { fontSize: 18, fontWeight: "900" }, // Dropped to 18 to lock fluid width layout scaling boundaries
  
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10 },
  itemRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkmark: { color: "#fff", fontSize: 12, fontWeight: "900" },
  itemName: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  catPill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  catPillText: { fontSize: 10, fontWeight: "700" },
  itemAmt: { fontSize: 14, fontWeight: "700", maxWidth: 90 },
  selSummary: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 4, paddingHorizontal: 4 },
  selLabel: { fontSize: 13, fontWeight: "500" },
  selTotal: { fontSize: 20, fontWeight: "900", maxWidth: 150 },
  confirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 18, paddingVertical: 18, gap: 10, marginTop: 12, marginBottom: 24,
    shadowColor: "#22D3A0", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
  },
  confirmIcon: { color: "#fff", fontSize: 20, fontWeight: "800" },
  confirmText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});