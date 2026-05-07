import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { Radio, UserPlus, Users, X } from "lucide-react-native";
import { Text } from "./AppText";
import { Button } from "./Button";
import { PlusBadge } from "./PlusBadge";
import { useAuth } from "../context/AuthContext";
import { usePlusUpsell } from "../context/PlusUpsellContext";
import { usePremium } from "../context/PremiumContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { useUsernameGate } from "../context/UsernameGateContext";
import { useRefreshPremiumAccess } from "../hooks/useRefreshPremiumAccess";
import { isSupabaseConfigured } from "../lib/env";
import {
  createLiveMiniSquad,
  inviteLiveMiniParticipant,
  listLiveMiniParticipantStatuses,
} from "../lib/liveMiniMissionsApi";
import {
  searchProfilesByUsernamePrefix,
} from "../lib/groupChallengesApi";
import { useHabitStore } from "../store/habitStore";
import type { MiniMission } from "../types/habit";
import type { LiveMiniParticipantStatus } from "../types/liveMiniMission";
import type { ProfileSearchRow } from "../types/groupChallenge";

type Props = {
  visible: boolean;
  mission: MiniMission;
  onClose: () => void;
};

function statusLabel(status: LiveMiniParticipantStatus | undefined): string | null {
  switch (status) {
    case "invited":
      return "Pending";
    case "declined":
      return "Declined";
    case "joined":
      return "Joined";
    case "in_progress":
      return "On mission";
    case "completed":
      return "Done";
    case "missed":
      return "Missed";
    case "cancelled":
      return "Cancelled";
    default:
      return null;
  }
}

export function LiveMiniInviteSheet({ visible, mission, onClose }: Props) {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();
  const { session } = useAuth();
  const { isPremium, loading: premiumLoading } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const refreshPremiumAccess = useRefreshPremiumAccess();
  const { requireUsername } = useUsernameGate();
  const setMiniMissionLiveSquad = useHabitStore((s) => s.setMiniMissionLiveSquad);

  const [squadId, setSquadId] = useState<string | null>(mission.liveSquadId ?? null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [statusByUserId, setStatusByUserId] = useState<Record<string, LiveMiniParticipantStatus>>({});
  const createBusyRef = useRef(false);
  const inviteBusyRef = useRef<string | null>(null);

  const signedIn = Boolean(session?.user);
  const configured = isSupabaseConfigured();
  const plusOk = isPremium && !premiumLoading;
  const canInviteInExistingSquad = !squadId || mission.liveSquadRole === "creator";

  useEffect(() => {
    if (visible) setSquadId(mission.liveSquadId ?? null);
  }, [mission.liveSquadId, visible]);

  const loadStatuses = useCallback(async (id: string) => {
    try {
      const next = await listLiveMiniParticipantStatuses(id);
      setStatusByUserId(next);
    } catch {
      setStatusByUserId({});
    }
  }, []);

  useEffect(() => {
    if (!visible || !squadId) {
      setStatusByUserId({});
      return;
    }
    void loadStatuses(squadId);
  }, [loadStatuses, squadId, visible]);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      return;
    }
    const q = query.trim();
    if (!squadId || q.length < 3) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      void searchProfilesByUsernamePrefix(q)
        .then((rows) => {
          if (cancelled) return;
          const uid = session?.user?.id;
          setResults(rows.filter((r) => r.id !== uid));
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          const msg = e instanceof Error ? e.message : String(e);
          showToast(msg, "error");
          setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, session?.user?.id, showToast, squadId, visible]);

  const handleCreate = useCallback(async () => {
    if (createBusyRef.current) return;
    if (!configured || !signedIn) return;
    createBusyRef.current = true;
    setCreating(true);
    try {
      const freshPremium = await refreshPremiumAccess({ force: true });
      if (freshPremium !== true) {
        openUpsell("live_mini");
        return;
      }
      const ok = await requireUsername("live_mini_create");
      if (!ok) {
        showToast("Choose a username to start Live Squad.", "info");
        return;
      }
      const res = await createLiveMiniSquad({
        miniMissionId: mission.id,
        title: mission.title,
        objective: mission.objective ?? null,
        plannedMinutes: mission.estimatedMinutes,
        startedAt: mission.startedAt ?? null,
      });
      if (res.ok === false) {
        if (res.reason === "premium_required") openUpsell("live_mini");
        else showToast(res.error, "error");
        return;
      }
      setMiniMissionLiveSquad(mission.id, res.squadId, "creator");
      setSquadId(res.squadId);
      showToast("Live Squad ready. Invite someone to join this mini mission.", "success");
    } finally {
      createBusyRef.current = false;
      setCreating(false);
    }
  }, [
    configured,
    mission,
    openUpsell,
    refreshPremiumAccess,
    requireUsername,
    setMiniMissionLiveSquad,
    showToast,
    signedIn,
  ]);

  const handleInvite = useCallback(
    async (userId: string) => {
      if (!squadId || statusByUserId[userId]) return;
      if (inviteBusyRef.current) return;
      if (mission.liveSquadRole !== "creator") {
        showToast("Only the Live Squad creator can invite more people.", "info");
        return;
      }
      inviteBusyRef.current = userId;
      setInvitingId(userId);
      try {
        const freshPremium = await refreshPremiumAccess({ force: true });
        if (freshPremium !== true) {
          openUpsell("live_mini");
          return;
        }
        const ok = await requireUsername("live_mini_invite");
        if (!ok) {
          showToast("Choose a username to invite people.", "info");
          return;
        }
        const res = await inviteLiveMiniParticipant(squadId, userId);
        if (res.ok === false) {
          showToast(res.error, "error");
          return;
        }
        await loadStatuses(squadId);
        showToast("Invite sent.", "success");
      } finally {
        inviteBusyRef.current = null;
        setInvitingId(null);
      }
    },
    [loadStatuses, mission.liveSquadRole, openUpsell, refreshPremiumAccess, requireUsername, showToast, squadId, statusByUserId],
  );

  const openBoard = () => {
    if (!squadId) return;
    onClose();
    router.push(`/live-mini/${squadId}`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView
        intensity={30}
        tint={isDark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.backdrop,
          { backgroundColor: isDark ? "rgba(0,0,0,0.42)" : "rgba(15,23,42,0.22)" },
        ]}
      >
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.sheetHead}>
            <View style={styles.titleCluster}>
              <View style={styles.titleRow}>
                <Text style={[styles.sheetTitle, { color: theme.colors.textPrimary }]}>Live Squad</Text>
                <PlusBadge withFlame />
              </View>
              <Text style={[styles.sheetHint, { color: theme.colors.textSecondary }]}>
                Invite people to run this mini mission on their own timer.
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
              hitSlop={12}
            >
              <X size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          {!configured || !signedIn ? (
            <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
              Sign in with cloud sync to start or join Live Squad mini missions.
            </Text>
          ) : !squadId ? (
            <View style={styles.createBlock}>
              <View style={[styles.liveInfo, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
                <Radio size={20} color={theme.colors.cyan[400]} />
                <View style={styles.liveInfoText}>
                  <Text style={[styles.liveInfoTitle, { color: theme.colors.textPrimary }]}>
                    Do it with others?
                  </Text>
                  <Text style={[styles.liveInfoBody, { color: theme.colors.textSecondary }]}>
                    Your mission stays normal. The live board only tracks who joined, finished, missed, or cancelled.
                  </Text>
                </View>
              </View>
              <Button
                title={creating ? "Starting Live Squad..." : "Start Live Squad"}
                onPress={() => void handleCreate()}
                disabled={creating}
              />
              {!plusOk ? (
                <Text style={[styles.plusHint, { color: theme.colors.textMuted }]}>
                  Hosting Live Squad is part of HabitPro Community. Invitees can join free.
                </Text>
              ) : null}
            </View>
          ) : (
            <>
              <View style={styles.boardRow}>
                <TouchableOpacity
                  style={[
                    styles.boardButton,
                    {
                      borderColor: isDark ? "rgba(34,211,238,0.35)" : "rgba(8,145,178,0.28)",
                      backgroundColor: isDark ? "rgba(34,211,238,0.1)" : "rgba(8,145,178,0.08)",
                    },
                  ]}
                  onPress={openBoard}
                  activeOpacity={0.88}
                >
                  <Users size={18} color={theme.colors.cyan[400]} />
                  <Text style={[styles.boardButtonText, { color: theme.colors.textPrimary }]}>
                    Open Live Board
                  </Text>
                </TouchableOpacity>
              </View>

              {canInviteInExistingSquad ? (
                <>
                  <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>INVITE BY USERNAME</Text>
                  <TextInput
                    editable={plusOk}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search username"
                    placeholderTextColor={theme.colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                      styles.input,
                      {
                        color: theme.colors.textPrimary,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.background,
                      },
                    ]}
                  />
                  {searching ? (
                    <ActivityIndicator color={theme.colors.indigo[400]} style={{ marginVertical: 10 }} />
                  ) : (
                    <FlatList
                      data={results}
                      keyExtractor={(item) => item.id}
                      keyboardShouldPersistTaps="handled"
                      style={styles.resultsList}
                      ListEmptyComponent={
                        query.trim().length >= 3 ? (
                          <Text style={[styles.emptySearch, { color: theme.colors.textMuted }]}>No matches</Text>
                        ) : null
                      }
                      renderItem={({ item }) => {
                        const st = statusByUserId[item.id];
                        const label = statusLabel(st);
                        const blocked = Boolean(st);
                        return (
                          <TouchableOpacity
                            style={[styles.resultRow, { borderColor: theme.colors.border, opacity: blocked ? 0.72 : 1 }]}
                            onPress={() => void handleInvite(item.id)}
                            disabled={blocked || invitingId === item.id}
                            activeOpacity={0.86}
                          >
                            <View style={styles.resultIdentity}>
                              <Text style={[styles.username, { color: theme.colors.textPrimary }]}>
                                @{item.username}
                              </Text>
                              {item.display_name ? (
                                <Text style={[styles.displayName, { color: theme.colors.textMuted }]} numberOfLines={1}>
                                  {item.display_name}
                                </Text>
                              ) : null}
                            </View>
                            {label ? (
                              <Text style={[styles.statusText, { color: theme.colors.textMuted }]}>{label}</Text>
                            ) : invitingId === item.id ? (
                              <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                            ) : (
                              <View style={styles.inviteCta}>
                                <UserPlus size={15} color={theme.colors.cyan[400]} />
                                <Text style={[styles.inviteCtaText, { color: theme.colors.cyan[400] }]}>Invite</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      }}
                    />
                  )}
                </>
              ) : (
                <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
                  Only the Live Squad creator can invite more people.
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", padding: 16 },
  sheet: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    maxHeight: "88%",
  },
  sheetHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  titleCluster: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  sheetTitle: { fontSize: 20, fontWeight: "900" },
  sheetHint: { fontSize: 13, lineHeight: 18, marginTop: 4, fontWeight: "600" },
  closeBtn: { width: 38, height: 38, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  createBlock: { gap: 12 },
  liveInfo: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row", gap: 12 },
  liveInfoText: { flex: 1, minWidth: 0 },
  liveInfoTitle: { fontSize: 16, fontWeight: "900", marginBottom: 4 },
  liveInfoBody: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  plusHint: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  boardRow: { marginBottom: 16 },
  boardButton: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  boardButtonText: { fontSize: 14, fontWeight: "900" },
  sectionLabel: { fontSize: 11, fontWeight: "900", marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, marginBottom: 10 },
  resultsList: { maxHeight: 260 },
  emptySearch: { fontSize: 13, fontWeight: "600", marginTop: 6 },
  resultRow: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 10 },
  resultIdentity: { flex: 1, minWidth: 0, paddingRight: 8 },
  username: { fontSize: 14, fontWeight: "900" },
  displayName: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  statusText: { fontSize: 12, fontWeight: "900" },
  inviteCta: { flexDirection: "row", alignItems: "center", gap: 4 },
  inviteCtaText: { fontSize: 12, fontWeight: "900" },
});
