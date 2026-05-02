import React, { useEffect, useMemo, useState } from "react";
import { Text } from "./AppText";
import {
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Users, X } from "lucide-react-native";
import type { Habit } from "../types/habit";
import { useTheme } from "../context/ThemeContext";
import { useHabitStore } from "../store/habitStore";
import { useToast } from "../context/ToastContext";
import { usePremium } from "../context/PremiumContext";
import { usePlusUpsell } from "../context/PlusUpsellContext";
import { useRefreshPremiumAccess } from "../hooks/useRefreshPremiumAccess";
import {
  STREAK_REPAIR_ALLOW_GROUP_SELF_APPROVE,
  STREAK_REPAIR_SQUAD_APPROVALS_REQUIRED,
  STREAK_REPAIR_WINDOW_HOURS,
} from "../constants/streakRepair";
import type { EligibleStreakRepair } from "../utils/streakRepairEligibility";
import { requestStreakRepair } from "../lib/streakRepairApi";
import { listChallengeMembers } from "../lib/groupChallengesApi";

const REASON_CHIPS = ["Busy day", "Sick", "Travel", "Forgot", "Other"] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  habit: Habit;
  eligible: EligibleStreakRepair;
  onRequested?: (info: { status: "pending" | "applied" }) => void;
};

export function StreakRepairSheet({ visible, onClose, habit, eligible, onRequested }: Props) {
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();
  const { isPremium, loading: premiumLoading } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const refreshPremiumAccess = useRefreshPremiumAccess();
  const xp = useHabitStore((s) => s.xp);
  const addXp = useHabitStore((s) => s.addXp);
  const toggleCompletion = useHabitStore((s) => s.toggleCompletion);

  const isGroup = Boolean(habit.challengeGroupId);
  const plusOk = !isGroup || (isPremium && !premiumLoading);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [askSquad, setAskSquad] = useState(true);
  const [approvalsRequired, setApprovalsRequired] = useState(STREAK_REPAIR_SQUAD_APPROVALS_REQUIRED);

  const canSelfApprove = !isGroup || STREAK_REPAIR_ALLOW_GROUP_SELF_APPROVE;
  const effectiveAskSquad = isGroup ? (canSelfApprove ? askSquad : true) : false;

  useEffect(() => {
    if (!visible || !isGroup) return;
    const cid = habit.challengeGroupId ?? null;
    if (!cid) return;
    let cancelled = false;
    void listChallengeMembers(cid)
      .then((rows) => {
        if (cancelled) return;
        const memberCount = rows.length;
        // Approvals exclude requester. For 2-person squads, require 1 approval.
        const req = Math.max(1, Math.min(STREAK_REPAIR_SQUAD_APPROVALS_REQUIRED, memberCount - 1));
        setApprovalsRequired(req);
      })
      .catch(() => {
        if (!cancelled) setApprovalsRequired(STREAK_REPAIR_SQUAD_APPROVALS_REQUIRED);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, isGroup, habit.challengeGroupId]);

  const cost = eligible.xpCost;
  const hasXp = xp >= cost;
  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0 && !busy && (!isGroup ? hasXp : true);

  const primaryLabel = useMemo(() => {
    if (isGroup) return "Request squad approval";
    return "Pay XP & repair";
  }, [isGroup]);

  useEffect(() => {
    if (!visible || !isGroup) return;
    void refreshPremiumAccess();
  }, [visible, isGroup, refreshPremiumAccess]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={30} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
      <Pressable
        style={[
          styles.backdrop,
          { backgroundColor: isDark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.22)" },
        ]}
        onPress={onClose}
      >
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.sheetHead}>
            <View style={styles.titleRow}>
              <Text style={[styles.sheetTitle, { color: theme.colors.textPrimary }]}>
                Repair streak
              </Text>
              {isGroup ? <Users size={18} color={theme.colors.indigo[400]} /> : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeBtn,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
              ]}
              hitSlop={12}
              accessibilityLabel="Close"
            >
              <X size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
            You missed day {eligible.missionDayNumber}. Repair within {STREAK_REPAIR_WINDOW_HOURS}h to keep your streak.
          </Text>

          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>What got in the way?</Text>
          <View style={styles.chipsRow}>
            {REASON_CHIPS.map((label) => (
              <TouchableOpacity
                key={label}
                onPress={() => setReason(label)}
                activeOpacity={0.85}
                style={[
                  styles.chip,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceElevated,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: theme.colors.textSecondary }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Type a short note (required)"
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.input,
              {
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.background,
              },
            ]}
            maxLength={140}
            multiline
          />

          <View style={[styles.costCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
            <Text style={[styles.costTitle, { color: theme.colors.textPrimary }]}>Cost: {cost} XP</Text>
            <Text style={[styles.costBody, { color: theme.colors.textMuted }]}>
              Repairs are limited and must be used within {STREAK_REPAIR_WINDOW_HOURS}h of the missed day.
            </Text>
            {isGroup && !plusOk ? (
              <Text style={[styles.costBody, { color: theme.colors.textSecondary, marginTop: 6 }]}>
                Streak repairs are part of HabitPro Community.
              </Text>
            ) : null}
            {!isGroup && !hasXp ? (
              <Text style={[styles.costBody, { color: theme.colors.red[500], marginTop: 6 }]}>
                Not enough XP. Earn more by completing missions.
              </Text>
            ) : null}
          </View>

          {isGroup ? (
            <View style={[styles.verifyCard, { borderColor: theme.colors.border }]}>
              <View style={styles.verifyHead}>
                <Users size={18} color={theme.colors.indigo[400]} />
                <Text style={[styles.verifyTitle, { color: theme.colors.textPrimary }]}>
                  Squad approval
                </Text>
              </View>
              <Text style={[styles.verifyBody, { color: theme.colors.textSecondary }]}>
                We’ll apply the repair after {approvalsRequired} squadmate{approvalsRequired === 1 ? "" : "s"} approve. XP is charged only when applied.
              </Text>
              {canSelfApprove ? (
                <View style={styles.toggleRow}>
                  <Text style={[styles.toggleLabel, { color: theme.colors.textSecondary }]}>
                    Ask squad to approve
                  </Text>
                  <TouchableOpacity
                    onPress={() => setAskSquad((v) => !v)}
                    activeOpacity={0.85}
                    style={[
                      styles.togglePill,
                      {
                        backgroundColor: effectiveAskSquad ? theme.colors.indigo[600] : theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.togglePillText, { color: effectiveAskSquad ? "#fff" : theme.colors.textMuted }]}>
                      {effectiveAskSquad ? "On" : "Off"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={!canSubmit}
            onPress={async () => {
              if (isGroup) {
                const freshPremium = await refreshPremiumAccess({ force: true });
                if (freshPremium !== true) {
                  openUpsell("streak_repair");
                  return;
                }
              }
              if (!trimmed) return;
              if (!isGroup && !hasXp) return;
              setBusy(true);
              const res = await requestStreakRepair({
                habitId: habit.id,
                dateStr: eligible.dateStr,
                reason: trimmed,
                xpCost: cost,
                challengeId: habit.challengeGroupId ?? null,
                approvalsRequired,
              });
              setBusy(false);
              if (!res.ok) {
                const msg = "error" in res ? res.error : "Streak repair failed.";
                showToast(msg, "error");
                return;
              }

              if (!isGroup) {
                // Solo repair: server already charged XP; keep local UX snappy and consistent.
                addXp(-cost);
                toggleCompletion(habit.id, eligible.dateStr);
                useHabitStore.getState().applyStreakRepairLocally({
                  habitId: habit.id,
                  dateStr: eligible.dateStr,
                  repairSource: "solo",
                  deductXp: false,
                });
                showToast("Streak repaired.", "success");
                onRequested?.({ status: "applied" });
              } else {
                showToast("Request sent to your squad.", "success");
                onRequested?.({ status: "pending" });
              }
              onClose();
            }}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: canSubmit ? theme.colors.amber[500] : theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.primaryBtnText, { color: "#111827" }]}>{busy ? "Working..." : primaryLabel}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sheetTitle: { fontSize: 18, fontWeight: "900" },
  closeBtn: { width: 36, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 14, fontWeight: "600" },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  chipText: { fontSize: 12, fontWeight: "800" },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, minHeight: 52, marginBottom: 12, fontWeight: "600" },
  costCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  costTitle: { fontSize: 16, fontWeight: "900", marginBottom: 4 },
  costBody: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  verifyCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  verifyHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  verifyTitle: { fontSize: 14, fontWeight: "900" },
  verifyBody: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  toggleLabel: { fontSize: 12, fontWeight: "800" },
  togglePill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  togglePillText: { fontSize: 12, fontWeight: "900" },
  primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryBtnText: { fontSize: 14, fontWeight: "900" },
});

