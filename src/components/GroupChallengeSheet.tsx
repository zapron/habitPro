import { Text } from "./AppText";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import type { Habit } from "../types/habit";
import { useTheme } from "../context/ThemeContext";
import { isSupabaseConfigured } from "../lib/env";
import {
  type ChallengeInviteeStatus,
  createGroupChallengeFromHabit,
  listChallengeInviteeStatusesForChallenge,
  searchProfilesByUsernamePrefix,
  sendChallengeInvite,
} from "../lib/groupChallengesApi";
import { useHabitStore } from "../store/habitStore";
import { useAuth } from "../context/AuthContext";
import { usePremium } from "../context/PremiumContext";
import { usePlusUpsell } from "../context/PlusUpsellContext";
import { useRefreshPremiumAccess } from "../hooks/useRefreshPremiumAccess";
import { useUsernameGate } from "../context/UsernameGateContext";
import type { ProfileSearchRow } from "../types/groupChallenge";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "../context/ToastContext";
import { PlusBadge } from "./PlusBadge";

type Props = {
  visible: boolean;
  onClose: () => void;
  habit: Habit;
};

export function GroupChallengeSheet({ visible, onClose, habit }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const router = useRouter();
  const { session } = useAuth();
  const { isPremium, loading: premiumLoading } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const refreshPremiumAccess = useRefreshPremiumAccess();
  const { requireUsername } = useUsernameGate();
  const plusOk = isPremium && !premiumLoading;
  const myUsername = useHabitStore((s) => s.username);

  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const inviteInFlightRef = useRef(new Set<string>());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [noUsernameDialogOpen, setNoUsernameDialogOpen] = useState(false);
  const [inviteeStatusById, setInviteeStatusById] = useState<
    Partial<Record<string, ChallengeInviteeStatus>>
  >({});

  const signedIn = Boolean(session?.user);
  const configured = isSupabaseConfigured();
  const inGroup = Boolean(habit.challengeGroupId);

  useEffect(() => {
    if (!visible || !configured || !signedIn) return;
    void refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true, background: true });
  }, [visible, configured, signedIn, refreshPremiumAccess]);

  const handleServerPremiumRequired = useCallback(async () => {
    await refreshPremiumAccess({ force: true, serverOnly: true });
    onClose();
    openUpsell("group_mission");
  }, [onClose, openUpsell, refreshPremiumAccess]);

  useEffect(() => {
    if (!visible || !habit.challengeGroupId || !configured || !signedIn) {
      setInviteeStatusById({});
      return;
    }
    let cancelled = false;
    void listChallengeInviteeStatusesForChallenge(habit.challengeGroupId)
      .then((m) => {
        if (!cancelled) setInviteeStatusById(m);
      })
      .catch(() => {
        if (!cancelled) setInviteeStatusById({});
      });
    return () => {
      cancelled = true;
    };
  }, [visible, habit.challengeGroupId, configured, signedIn]);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      void searchProfilesByUsernamePrefix(q)
        .then((rows) => {
          if (!cancelled) {
            const uid = session?.user?.id;
            setResults(rows.filter((r) => r.id !== uid));
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : String(e);
            showToast(msg, "error");
            setResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, visible, session?.user?.id, showToast]);

  const handleCreateGroup = useCallback(async () => {
    if (!configured || !signedIn || creating || creatingRef.current || habit.challengeGroupId) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
      if (freshPremium !== true) {
        onClose();
        openUpsell("group_mission");
        return;
      }
      const ok = await requireUsername("group_mission_create");
      if (!ok) {
        showToast("Choose a username to start a group mission.", "info");
        return;
      }
      const { group, error, reason } = await createGroupChallengeFromHabit(habit);
      if (error || !group) {
        if (reason === "premium_required") {
          await handleServerPremiumRequired();
          return;
        }
        showToast(error?.message ?? "Unknown error", "error");
        return;
      }
      useHabitStore.getState().synchronizeHabitWithChallengeGroup(habit.id, group);
      showToast("Group mission ready. Invite your squad.", "success");
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [configured, creating, signedIn, habit, showToast, onClose, openUpsell, requireUsername, refreshPremiumAccess, handleServerPremiumRequired]);

  const handleInvite = useCallback(
    async (userId: string) => {
      const gid = habit.challengeGroupId;
      const inviteKey = gid ? `${gid}:${userId}` : userId;
      const currentStatus = inviteeStatusById[userId];
      if (
        invitingId ||
        currentStatus === "pending" ||
        currentStatus === "accepted" ||
        inviteInFlightRef.current.has(inviteKey)
      ) {
        return;
      }
      inviteInFlightRef.current.add(inviteKey);
      setInvitingId(userId);
      try {
        const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
        if (freshPremium !== true) {
          onClose();
          openUpsell("group_mission");
          return;
        }
        if (!gid) {
          showToast("Start a group mission from this habit, then invite friends.", "info");
          return;
        }
        const uname = myUsername?.trim() ?? "";
        if (!uname) {
          const ok = await requireUsername("group_invite");
          if (!ok) {
            showToast("Choose a username to invite your squad.", "info");
          }
          return;
        }
        const { error, reason } = await sendChallengeInvite(gid, userId);
        if (error) {
          if (reason === "premium_required") {
            await handleServerPremiumRequired();
            return;
          }
          showToast(error.message, "error");
          return;
        }
        setInviteeStatusById((prev) => ({ ...prev, [userId]: "pending" }));
        showToast("Invite sent. They’ll see it under Compete and in notifications.", "success");
        void listChallengeInviteeStatusesForChallenge(gid).then(setInviteeStatusById).catch(() => undefined);
      } finally {
        inviteInFlightRef.current.delete(inviteKey);
        setInvitingId(null);
      }
    },
    [habit.challengeGroupId, inviteeStatusById, invitingId, myUsername, showToast, onClose, openUpsell, requireUsername, refreshPremiumAccess, handleServerPremiumRequired],
  );

  const openChallenge = () => {
    const id = habit.challengeGroupId;
    if (!id) return;
    onClose();
    router.push(`/challenge/${id}`);
  };

  return (
    <>
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        style={styles.keyboardAvoider}
      >
        <View style={[styles.backdrop, { backgroundColor: theme.colors.background === '#ffffff' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.4)' }]}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                paddingBottom: Math.max(insets.bottom, 20),
              },
            ]}
          >
          <View style={styles.sheetHead}>
            <View style={styles.titleRow}>
              <Text style={[styles.sheetTitle, { color: theme.colors.textPrimary }]}>Group mission</Text>
              <PlusBadge withFlame />
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
            <Text style={{ color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
              Sign in with Supabase configured to start or join group missions.
            </Text>
          ) : inGroup ? (
            <>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 14, marginBottom: 12, lineHeight: 20 }}>
                This mission is linked to a group. Open the group mission to see the cohort.
              </Text>
              <Button title="Open group mission" onPress={openChallenge} />
              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Invite someone</Text>
              <TextInput
                editable
                value={query}
                onChangeText={setQuery}
                placeholder="Search by username"
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
                <ActivityIndicator color={theme.colors.indigo[400]} style={{ marginVertical: 8 }} />
              ) : (
                <ScrollView
                  style={{ maxHeight: 200 }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {results.length === 0 && query.trim().length >= 3 ? (
                    <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 8 }}>No matches</Text>
                  ) : null}
                  {results.map((item) => {
                    const st = inviteeStatusById[item.id];
                    const blocked = st === "pending" || st === "accepted";
                    const statusLabel =
                      st === "pending"
                        ? "Already invited"
                        : st === "declined"
                          ? "Invite again"
                          : st === "left"
                            ? "Re-invite"
                            : st === "accepted"
                              ? "Joined"
                              : null;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.row, { borderColor: theme.colors.border, opacity: blocked ? 0.75 : 1 }]}
                        onPress={() => void handleInvite(item.id)}
                        disabled={invitingId === item.id || blocked}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.colors.textPrimary, fontWeight: "700" }}>
                            {item.username}
                          </Text>
                          {item.display_name ? (
                            <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>{item.display_name}</Text>
                          ) : null}
                        </View>
                        {invitingId === item.id ? (
                          <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                        ) : statusLabel ? (
                          <Text
                            style={{
                              color: st === "declined" || st === "left" ? theme.colors.cyan[400] : theme.colors.textMuted,
                              fontWeight: "700",
                            }}
                          >
                            {statusLabel}
                          </Text>
                        ) : (
                          <Text style={{ color: theme.colors.cyan[400], fontWeight: "700" }}>Invite</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </>
          ) : (
            <>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 14, marginBottom: 14, lineHeight: 20 }}>
                Create a shared group mission from this habit. You stay on this mission; invitees get a matching one when
                they accept.
              </Text>
              <Button
                title={creating ? "Creating…" : "Start group mission"}
                onPress={() => void handleCreateGroup()}
                disabled={creating}
              />
              {!plusOk ? (
                <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 10, lineHeight: 17 }}>
                  Group missions and invites are HabitPro Community.
                </Text>
              ) : null}
            </>
          )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    <ConfirmDialog
      visible={noUsernameDialogOpen}
      onRequestClose={() => setNoUsernameDialogOpen(false)}
      title="Set a username first"
      message="You need a public username so your squad knows who sent the invite. Open Profile → settings and choose a username."
      actions={[
        { label: "Cancel", variant: "secondary", onPress: () => setNoUsernameDialogOpen(false) },
        {
          label: "Go to Profile",
          onPress: () => {
            setNoUsernameDialogOpen(false);
            onClose();
            router.push("/(tabs)/profile");
          },
        },
      ]}
    />
    </>
  );
}

const styles = StyleSheet.create({
  keyboardAvoider: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 28,
    maxHeight: "88%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  sheetTitle: { fontSize: 18, fontWeight: "800", flex: 1, minWidth: 0 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
