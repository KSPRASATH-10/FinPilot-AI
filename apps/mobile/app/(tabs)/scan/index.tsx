import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ScrollView, ActivityIndicator, Alert,
  Share, TextInput, Switch, Modal,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Screen } from "../../../components/ui/Screen";
import { GlassCard } from "../../../components/ui/GlassCard";
import { useTransactionStore } from "../../../store/useFinanceStores";
import { useAuthStore } from "../../../store/useAuthStore";
import { useTheme } from "../../../theme/useTheme";
import { DARK as DT } from "../../../theme";

const API_URL =
  (typeof globalThis !== "undefined" ? (globalThis as any).process?.env?.EXPO_PUBLIC_API_URL : undefined) ||
  "http://10.119.233.135:4000";

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

interface ScanRecord {
  merchantName: string;
  totalCost: number;
  items: { name: string; amount: number; category: string }[];
  timestamp: number;
  date: string;
}

interface BudgetAdjustment {
  category: string;
  oldRemaining: number;
  newRemaining: number;
  cutAmount: number;
}

interface BudgetOptimisation {
  triggered: boolean;
  overflowCategory: string;
  overflowAmount: number;
  adjustments: BudgetAdjustment[];
  message: string;
}

// Payload shape captured when a duplicate is detected — used to retry with override
interface PendingConfirmPayload {
  merchantName: string;
  totalCost: number;
  items: ExtractedItem[];
  date: string;
  selectedItemsList: ExtractedItem[];
  addedCount: number;
}

export default function ScanScreen() {
  const T = useTheme();
  const user = useAuthStore((s) => s.user);
  const token = user?.accessToken;
  const addTransaction = useTransactionStore((s) => s.addTransaction);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [confirmed, setConfirmed] = useState(false);

  // Scan history
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Split bill
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitCount, setSplitCount] = useState("2");

  // Duplicate detection modal
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<PendingConfirmPayload | null>(null);

  // Budget optimisation alert
  const [budgetAlert, setBudgetAlert] = useState<BudgetOptimisation | null>(null);

  const loadScanHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/bills/history`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const body = await res.json();
      setScanHistory(body?.data?.scans ?? []);
    } catch {
      // Silent
    } finally {
      setHistoryLoading(false);
    }
  }, [token]);

  useEffect(() => { loadScanHistory(); }, []);

  const requestAndPick = async (useCamera: boolean) => {
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission Required", "Camera access is needed to scan bills.");
        return;
      }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission Required", "Gallery access is needed to pick bill images.");
        return;
      }
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
    };

    const res = useCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (res.canceled || !res.assets?.[0]?.uri) return;

    const uri = res.assets[0].uri;
    setImageUri(uri);
    setResult(null);
    setSelectedItems(new Set());
    setConfirmed(false);
    setSplitEnabled(false);
    setSplitCount("2");
    setBudgetAlert(null);
    await processImage(uri);
  };

  const processImage = async (uri: string) => {
    setProcessing(true);
    try {
      const b64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const fileExt = uri.split(".").pop() ?? "jpeg";

      const res = await fetch(`${API_URL}/api/v1/bills/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          imageBase64: b64Data,
          mimeType: `image/${fileExt === "jpg" ? "jpeg" : fileExt}`,
        }),
      });

      if (!res.ok) throw new Error("Server rejected image payload");
      const body = await res.json();
      const ocrResult: OCRResult = body.data;
      if (!ocrResult?.items?.length) throw new Error("No items extracted from image.");
      setResult(ocrResult);
      setSelectedItems(new Set(ocrResult.items.map((_, i) => i)));
    } catch (err: any) {
      console.error("[OCR Error]:", err.message);
      Alert.alert("⚠️ Extraction Failed", "Could not read this receipt. Please try with better lighting.");
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

  const selectedTotal = result
    ? result.items.filter((_, i) => selectedItems.has(i)).reduce((s, it) => s + it.amount, 0)
    : 0;

  const splitN = Math.max(1, parseInt(splitCount, 10) || 1);
  const myShare = splitEnabled ? Math.ceil(selectedTotal / splitN) : selectedTotal;

  // ─── Core confirm logic — shared between first attempt and force-override ──
  const executeConfirm = async (payload: PendingConfirmPayload, overrideDuplicate: boolean) => {
    // 1. Add transactions to local ledger
    payload.selectedItemsList.forEach((item, idx) => {
      const personalAmount = splitEnabled ? Math.ceil(item.amount / splitN) : item.amount;
      addTransaction({
        id: `scan_${Date.now()}_${idx}`,
        date: payload.date,
        amount: personalAmount,
        category: item.category,
        description: splitEnabled ? `${item.name} (1/${splitN} split)` : item.name,
        type: "expense",
      });
    });

    // 2. POST to backend /confirm with optional override flag
    try {
      const res = await fetch(`${API_URL}/api/v1/bills/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          merchantName: payload.merchantName,
          totalCost: payload.totalCost,
          items: payload.selectedItemsList,
          date: payload.date,
          overrideDuplicate,
        }),
      });

      const responseBody = await res.json();

      // Handle duplicate detection 409
      if (res.status === 409 && responseBody?.isPotentialDuplicate) {
        // Store payload for potential force-add and show modal
        setPendingPayload(payload);
        setShowDuplicateModal(true);
        return; // halt — do NOT mark as confirmed yet
      }

      // Surface budget optimisation result if triggered
      if (responseBody?.data?.budgetOptimisation?.triggered) {
        setBudgetAlert(responseBody.data.budgetOptimisation as BudgetOptimisation);
      }

      await loadScanHistory();
    } catch (e: any) {
      console.error("[ScanConfirm] Backend save failed:", e.message);
    }

    // 3. Native share sheet for split bills
    if (splitEnabled && splitN > 1) {
      const eachOwes = Math.ceil(selectedTotal / splitN);
      const shareText =
        `📊 FinPilot AI Split Bill Recap\n` +
        `🏪 Merchant: ${payload.merchantName}\n` +
        `💰 Total Bill: ₹${selectedTotal.toLocaleString()}\n` +
        `👥 Split Count: ${splitN} Ways\n` +
        `-------------------------\n` +
        `💳 Your Share: ₹${eachOwes.toLocaleString()}\n` +
        `💸 Each Friend Owes: ₹${eachOwes.toLocaleString()}\n\n` +
        `Generated securely via FinPilot AI.`;
      try {
        await Share.share({ message: shareText });
      } catch { /* User dismissed */ }
    }

    setConfirmed(true);
    Alert.alert(
      "✓ Expenses Added",
      splitEnabled
        ? `Your share (₹${myShare.toLocaleString()}) added across ${payload.addedCount} item(s).`
        : `${payload.addedCount} transaction(s) synced to your ledger.`
    );
  };

  // ─── Initial confirm tap ──────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!result) return;
    const selectedItemsList = result.items.filter((_, i) => selectedItems.has(i));

    const payload: PendingConfirmPayload = {
      merchantName: result.merchant ?? "Receipt",
      totalCost: result.total,
      items: result.items,
      date: result.date ?? new Date().toISOString(),
      selectedItemsList,
      addedCount: selectedItemsList.length,
    };

    await executeConfirm(payload, false);
  };

  // ─── Force add (user chose to override duplicate warning) ─────────────────
  const handleForceAdd = async () => {
    setShowDuplicateModal(false);
    if (!pendingPayload) return;
    await executeConfirm(pendingPayload, true);
    setPendingPayload(null);
  };

  const handleReset = () => {
    setImageUri(null);
    setResult(null);
    setSelectedItems(new Set());
    setConfirmed(false);
    setSplitEnabled(false);
    setSplitCount("2");
    setBudgetAlert(null);
  };

  return (
    <Screen scroll>
      <Text style={s.pageTitle}>Bill Scanner</Text>
      <Text style={[s.pageSub, { color: T.textSub }]}>Scan or upload a receipt to extract expenses</Text>

      {/* ── Duplicate Detection Modal ── */}
      <Modal visible={showDuplicateModal} transparent animationType="fade">
        <View style={s.dupModalOverlay}>
          <View style={[s.dupModalCard, { backgroundColor: DT.bg, borderColor: DT.border }]}>
            <View style={[s.dupModalIconRow, { backgroundColor: `${DT.warning}18` }]}>
              <Text style={s.dupModalIcon}>⚠️</Text>
            </View>
            <Text style={[s.dupModalTitle, { color: DT.text }]}>Potential Duplicate Scan</Text>
            <Text style={[s.dupModalBody, { color: DT.textSub }]}>
              We noticed an identical transaction was logged moments ago. Are you sure you want to add this again?
            </Text>
            <TouchableOpacity
              style={[s.dupForceBtn, { backgroundColor: DT.danger }]}
              onPress={handleForceAdd}
              activeOpacity={0.82}
            >
              <Text style={s.dupForceBtnText}>Force Add Anyway</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.dupCancelBtn, { borderColor: DT.border }]}
              onPress={() => { setShowDuplicateModal(false); setPendingPayload(null); }}
              activeOpacity={0.78}
            >
              <Text style={[s.dupCancelBtnText, { color: DT.textSub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Recent Scans History ── */}
      {!imageUri && (
        <>
          {historyLoading ? (
            <ActivityIndicator color={T.accent} style={{ marginBottom: 16 }} />
          ) : scanHistory.length > 0 ? (
            <View style={s.historySection}>
              <Text style={[s.historySectionTitle, { color: T.text }]}>Recent Scans</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.historyRow}>
                {scanHistory.slice(0, 5).map((scan, i) => (
                  <View key={i} style={[s.historyCard, { backgroundColor: T.card, borderColor: T.cardBorder }]}>
                    <View style={[s.historyIconBox, { backgroundColor: `${T.accent}18` }]}>
                      <Text style={s.historyIcon}>🧾</Text>
                    </View>
                    <View style={s.historyCardBody}>
                      <Text style={[s.historyMerchant, { color: T.text }]} numberOfLines={1}>
                        {scan.merchantName}
                      </Text>
                      <Text style={[s.historyTotal, { color: T.danger }]}>
                        ₹{scan.totalCost.toLocaleString()}
                      </Text>
                      <Text style={[s.historyDate, { color: T.textMuted }]}>
                        {new Date(scan.timestamp).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Image Source Picker */}
          <GlassCard style={s.pickCard}>
            <Text style={[s.pickPrompt, { color: T.text }]}>Choose image source</Text>
            <Text style={[s.pickSub, { color: T.textSub }]}>
              Point at a receipt, bill, or invoice — FinPilot AI will extract all line items automatically.
            </Text>
            <View style={s.pickRow}>
              <TouchableOpacity
                style={[s.pickBtn, { backgroundColor: T.accent }]}
                onPress={() => requestAndPick(true)}
                activeOpacity={0.82}
              >
                <Text style={s.pickBtnIcon}>📷</Text>
                <Text style={s.pickBtnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.pickBtn, { backgroundColor: T.card, borderColor: T.border, borderWidth: 1 }]}
                onPress={() => requestAndPick(false)}
                activeOpacity={0.82}
              >
                <Text style={s.pickBtnIcon}>🖼️</Text>
                <Text style={[s.pickBtnText, { color: T.text }]}>Gallery</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </>
      )}

      {/* Image Preview */}
      {imageUri && (
        <GlassCard noPad style={s.imageCard}>
          <Image source={{ uri: imageUri }} style={s.previewImage} resizeMode="cover" />
          <View style={[s.imageOverlay, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
            {processing ? (
              <View style={s.processingRow}>
                <ActivityIndicator color={T.accent} size="large" />
                <Text style={s.processingText}>Extracting line items...</Text>
              </View>
            ) : !confirmed ? (
              <TouchableOpacity style={s.retakeBtn} onPress={handleReset} activeOpacity={0.78}>
                <Text style={s.retakeBtnText}>✕ Retake</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </GlassCard>
      )}

      {/* OCR Results */}
      {result && !processing && !confirmed && (
        <>
          <GlassCard style={s.billSummary}>
            <View style={s.billHeaderRow}>
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
                    <Text style={[s.itemName, { color: sel ? T.text : T.textSub }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <View style={[s.catPill, { backgroundColor: `${T.accentAlt}18` }]}>
                      <Text style={[s.catPillText, { color: T.accentAlt }]}>{item.category}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[s.itemAmt, { color: sel ? T.danger : T.textMuted }]} numberOfLines={1}>
                      ₹{item.amount.toLocaleString()}
                    </Text>
                    {sel && splitEnabled && splitN > 1 && (
                      <Text style={[s.itemSplitAmt, { color: T.success }]}>
                        ÷{splitN} = ₹{Math.ceil(item.amount / splitN).toLocaleString()}
                      </Text>
                    )}
                  </View>
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

          {/* Split Bill Engine */}
          <GlassCard style={[s.splitCard, { borderColor: splitEnabled ? `${T.accent}55` : T.cardBorder }]}>
            <View style={s.splitHeaderRow}>
              <View>
                <Text style={[s.splitTitle, { color: T.text }]}>👥 Split This Bill</Text>
                <Text style={[s.splitSubtitle, { color: T.textSub }]}>Divide the cost equally with friends</Text>
              </View>
              <Switch
                value={splitEnabled}
                onValueChange={(v) => { setSplitEnabled(v); if (!v) setSplitCount("2"); }}
                trackColor={{ false: T.surfaceHigh, true: `${T.accent}88` }}
                thumbColor={splitEnabled ? T.accent : T.textMuted}
              />
            </View>
            {splitEnabled && (
              <>
                <View style={[s.splitDivider, { backgroundColor: T.border }]} />
                <Text style={[s.splitFieldLabel, { color: T.textSub }]}>Number of people splitting</Text>
                <View style={s.splitCountRow}>
                  <TouchableOpacity
                    style={[s.splitCountBtn, { borderColor: T.border, backgroundColor: T.card }]}
                    onPress={() => setSplitCount((prev) => String(Math.max(2, (parseInt(prev, 10) || 2) - 1)))}
                  >
                    <Text style={[s.splitCountBtnText, { color: T.text }]}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[s.splitCountInput, { backgroundColor: T.inputBg, borderColor: T.border, color: T.text }]}
                    value={splitCount}
                    onChangeText={(v) => setSplitCount(v.replace(/[^0-9]/g, ""))}
                    keyboardType="numeric"
                    maxLength={2}
                    textAlign="center"
                  />
                  <TouchableOpacity
                    style={[s.splitCountBtn, { borderColor: T.border, backgroundColor: T.card }]}
                    onPress={() => setSplitCount((prev) => String(Math.min(20, (parseInt(prev, 10) || 2) + 1)))}
                  >
                    <Text style={[s.splitCountBtnText, { color: T.text }]}>+</Text>
                  </TouchableOpacity>
                </View>
                <View style={[s.splitSummaryBox, { backgroundColor: `${T.accent}10`, borderColor: `${T.accent}33` }]}>
                  <View style={s.splitSummaryRow}>
                    <Text style={[s.splitSummaryLabel, { color: T.textSub }]}>Full Bill Total</Text>
                    <Text style={[s.splitSummaryVal, { color: T.text }]}>₹{selectedTotal.toLocaleString()}</Text>
                  </View>
                  <View style={s.splitSummaryRow}>
                    <Text style={[s.splitSummaryLabel, { color: T.textSub }]}>Split {splitN} Ways</Text>
                    <Text style={[s.splitSummaryVal, { color: T.accent }]}>÷ {splitN}</Text>
                  </View>
                  <View style={[s.splitSummaryDivider, { backgroundColor: `${T.accent}33` }]} />
                  <View style={s.splitSummaryRow}>
                    <Text style={[s.splitSummaryLabelBold, { color: T.text }]}>Your Share</Text>
                    <Text style={[s.splitSummaryShare, { color: T.success }]}>₹{Math.ceil(selectedTotal / splitN).toLocaleString()}</Text>
                  </View>
                  <Text style={[s.splitShareNote, { color: T.textMuted }]}>
                    Only your share will be added to your ledger. Share the summary with friends after confirming.
                  </Text>
                </View>
              </>
            )}
          </GlassCard>

          <TouchableOpacity
            style={[s.confirmBtn, { backgroundColor: T.success }, selectedItems.size === 0 && { opacity: 0.4 }]}
            onPress={handleConfirm}
            disabled={selectedItems.size === 0}
            activeOpacity={0.82}
          >
            <Text style={s.confirmIcon}>✓</Text>
            <Text style={s.confirmText}>
              {splitEnabled
                ? `Add My Share · ₹${Math.ceil(selectedTotal / splitN).toLocaleString()}`
                : "Confirm & Add to Expenses"}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Budget Optimisation Alert Card ── */}
      {budgetAlert && budgetAlert.triggered && (
        <View style={[s.budgetAlertCard, { backgroundColor: `${T.warning}14`, borderColor: `${T.warning}55` }]}>
          <View style={s.budgetAlertHeader}>
            <Text style={s.budgetAlertIcon}>⚠️</Text>
            <Text style={[s.budgetAlertTitle, { color: T.text }]}>Budget Auto-Adjusted</Text>
            <TouchableOpacity onPress={() => setBudgetAlert(null)}>
              <Text style={[s.budgetAlertClose, { color: T.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={[s.budgetAlertMsg, { color: T.textSub }]}>{budgetAlert.message}</Text>
          {budgetAlert.adjustments.length > 0 && (
            <View style={s.budgetAdjList}>
              {budgetAlert.adjustments.map((adj, i) => (
                <View key={i} style={[s.budgetAdjRow, { borderTopColor: `${T.warning}33`, borderTopWidth: i > 0 ? 1 : 0 }]}>
                  <Text style={[s.budgetAdjCat, { color: T.text }]}>{adj.category}</Text>
                  <View style={s.budgetAdjVals}>
                    <Text style={[s.budgetAdjOld, { color: T.textMuted }]}>₹{adj.oldRemaining.toLocaleString()}</Text>
                    <Text style={[s.budgetAdjArrow, { color: T.warning }]}> → </Text>
                    <Text style={[s.budgetAdjNew, { color: T.success }]}>₹{adj.newRemaining.toLocaleString()}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Post-confirm */}
      {confirmed && (
        <TouchableOpacity
          style={[s.resetBtn, { backgroundColor: T.card, borderColor: T.cardBorder }]}
          onPress={handleReset}
          activeOpacity={0.78}
        >
          <Text style={[s.resetText, { color: T.text }]}>✦ Scan Another Bill</Text>
        </TouchableOpacity>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 20, color: "#F0F4FF" },
  pageSub: { fontSize: 13, marginBottom: 16 },

  // Duplicate modal
  dupModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  dupModalCard: { width: "100%", borderRadius: 24, borderWidth: 1, padding: 28 },
  dupModalIconRow: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 16, alignSelf: "center" },
  dupModalIcon: { fontSize: 28 },
  dupModalTitle: { fontSize: 19, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  dupModalBody: { fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 24 },
  dupForceBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  dupForceBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  dupCancelBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  dupCancelBtnText: { fontSize: 15, fontWeight: "600" },

  // Budget alert card
  budgetAlertCard: { borderRadius: 18, borderWidth: 1.5, padding: 18, marginTop: 16, marginBottom: 8 },
  budgetAlertHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  budgetAlertIcon: { fontSize: 20 },
  budgetAlertTitle: { flex: 1, fontSize: 15, fontWeight: "800" },
  budgetAlertClose: { fontSize: 16, paddingHorizontal: 4 },
  budgetAlertMsg: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
  budgetAdjList: { gap: 0 },
  budgetAdjRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  budgetAdjCat: { fontSize: 13, fontWeight: "600" },
  budgetAdjVals: { flexDirection: "row", alignItems: "center" },
  budgetAdjOld: { fontSize: 13, textDecorationLine: "line-through" },
  budgetAdjArrow: { fontSize: 13, fontWeight: "700" },
  budgetAdjNew: { fontSize: 13, fontWeight: "700" },

  // History
  historySection: { marginTop: 4, marginBottom: 20 },
  historySectionTitle: { fontSize: 15, fontWeight: "800", marginBottom: 10 },
  historyRow: { gap: 12, paddingBottom: 4 },
  historyCard: { width: 130, borderRadius: 16, overflow: "hidden", borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  historyIconBox: { width: 130, height: 72, alignItems: "center", justifyContent: "center" },
  historyIcon: { fontSize: 36 },
  historyCardBody: { padding: 10 },
  historyMerchant: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  historyTotal: { fontSize: 14, fontWeight: "900", marginBottom: 2 },
  historyDate: { fontSize: 10 },

  // Pick card
  pickCard: { alignItems: "center", paddingVertical: 36 },
  pickPrompt: { fontSize: 20, fontWeight: "800", marginBottom: 10, textAlign: "center" },
  pickSub: { fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 28, paddingHorizontal: 10 },
  pickRow: { flexDirection: "row", gap: 14, width: "100%" },
  pickBtn: { flex: 1, alignItems: "center", paddingVertical: 18, borderRadius: 16, gap: 8 },
  pickBtnIcon: { fontSize: 28 },
  pickBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Image preview
  imageCard: { marginBottom: 16, overflow: "hidden" },
  previewImage: { width: "100%", height: 220 },
  imageOverlay: { position: "absolute", top: 0, left: 0, right: 0, height: 220, alignItems: "center", justifyContent: "center" },
  processingRow: { alignItems: "center", gap: 14 },
  processingText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  retakeBtn: { position: "absolute", top: 12, right: 12, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  retakeBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Bill summary
  billSummary: { marginBottom: 16 },
  billHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 8 },
  merchantContainer: { flex: 1, marginRight: 4 },
  merchantName: { fontSize: 18, fontWeight: "800", marginBottom: 4, lineHeight: 24 },
  billDate: { fontSize: 13 },
  totalBadge: { alignItems: "flex-end", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, minWidth: 100, maxWidth: "40%" },
  totalBadgeLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 2 },
  totalBadgeVal: { fontSize: 18, fontWeight: "900" },

  // Line items
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10 },
  itemRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkmark: { color: "#fff", fontSize: 12, fontWeight: "900" },
  itemName: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  catPill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  catPillText: { fontSize: 10, fontWeight: "700" },
  itemAmt: { fontSize: 14, fontWeight: "700", maxWidth: 90 },
  itemSplitAmt: { fontSize: 11, fontWeight: "700", marginTop: 2 },

  // Selection summary
  selSummary: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 4, paddingHorizontal: 4 },
  selLabel: { fontSize: 13, fontWeight: "500" },
  selTotal: { fontSize: 20, fontWeight: "900", maxWidth: 150 },

  // Split bill
  splitCard: { marginTop: 12, borderWidth: 1.5 },
  splitHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  splitTitle: { fontSize: 16, fontWeight: "800", marginBottom: 2 },
  splitSubtitle: { fontSize: 12 },
  splitDivider: { height: 1, marginVertical: 16 },
  splitFieldLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  splitCountRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  splitCountBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  splitCountBtnText: { fontSize: 22, fontWeight: "700", lineHeight: 28 },
  splitCountInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, fontSize: 20, fontWeight: "800" },
  splitSummaryBox: { borderRadius: 14, borderWidth: 1, padding: 14 },
  splitSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  splitSummaryLabel: { fontSize: 13 },
  splitSummaryVal: { fontSize: 14, fontWeight: "700" },
  splitSummaryDivider: { height: 1, marginVertical: 8 },
  splitSummaryLabelBold: { fontSize: 14, fontWeight: "700" },
  splitSummaryShare: { fontSize: 20, fontWeight: "900" },
  splitShareNote: { fontSize: 11, marginTop: 8, lineHeight: 16 },

  // Confirm / reset
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 18, paddingVertical: 18, gap: 10, marginTop: 12, marginBottom: 24, shadowColor: "#22D3A0", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  confirmIcon: { color: "#fff", fontSize: 20, fontWeight: "800" },
  confirmText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  resetBtn: { borderRadius: 16, paddingVertical: 16, alignItems: "center", borderWidth: 1, marginTop: 12, marginBottom: 24 },
  resetText: { fontSize: 15, fontWeight: "700" },
});