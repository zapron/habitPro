import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import type { Habit } from "../types/habit";
import { useTheme } from "../context/ThemeContext";
import { isSupabaseConfigured } from "../lib/env";
import {
  createGroupChallengeFromHabit,
  searchProfilesByEmailPrefix,
  sendChallengeInvite,
} from "../lib/groupChallengesApi";
import { useHabitStore } from "../store/habitStore";
import { useAuth } from "../context/AuthContext";
import type { ProfileSearchRow } from "../types/groupChallenge";
import { Button } from "./Button";

type Props = {
  visible: boolean;
  onClose: () => void;
  habit: Habit;
};

export function GroupChallengeSheet({ visible, onClose, habit }: Props) {
  const { theme } = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const setHabitChallengeMeta = useHabitStore((s) => s.setHabitChallengeMeta);

  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const signedIn = Boolean(session?.user);
  const configured = isSupabaseConfigured();
  const inGroup = Boolean(habit.challengeGroupId);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      return;
    }
    let cancelled = false;
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      void searchProfilesByEmailPrefix(q)
        .then((rows) => {
          if (!cancelled) {
            const uid = session?.user?.id;
            setResults(rows.filter((r) => r.id !== uid));
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : String(e);
            Alert.alert("Search failed", msg);
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
  }, [query, visible, session?.user?.id]);

  const handleCreateGroup = useCallback(async () => {
    if (!configured || !signedIn) return;
    setCreating(true);
    try {
      const { group, error } = await createGroupChallengeFromHabit(habit);
      if (error || !group) {
        Alert.alert("Could not create group", error?.message ?? "Unknown error");
        return;
      }
      setHabitChallengeMeta(habit.id, {
        challengeGroupId: group.id,
        challengeCreatorTimezone: group.creator_timezone,
      });
    } finally {
      setCreating(false);
    }
  }, [configured, signedIn, habit, setHabitChallengeMeta]);

  const handleInvite = useCallback(
    async (userId: string) => {
      const gid = habit.challengeGroupId;
      if (!gid) {
        Alert.alert("Create a group first", "Start a group challenge, then invite friends.");
        return;
      }
      setInvitingId(userId);
      try {
        const { error } = await sendChallengeInvite(gid, userId);
        if (error) {
          Alert.alert("Invite failed", error.message);
          return;
        }
        Alert.alert("Invite sent", "They will see it under Compete and in notifications.");
      } finally {
        setInvitingId(null);
      }
    },
    [habit.challengeGroupId],
  );

  const openChallenge = () => {
    const id = habit.challengeGroupId;
    if (!id) return;
    onClose();
    router.push(`/challenge/${id}`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: theme.colors.textPrimary }]}>Group challenge</Text>
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
              Sign in with Supabase configured to start or join group challenges.
            </Text>
          ) : inGroup ? (
            <>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 14, marginBottom: 12, lineHeight: 20 }}>
                This mission is linked to a group. Open the challenge to see the cohort.
              </Text>
              <Button title="Open challenge" onPress={openChallenge} />
              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Invite someone</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search by email"
                keyboardType="email-address"
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
                <FlatList
                  data={results}
                  keyExtractor={(item) => item.id}
                  style={{ maxHeight: 200 }}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    query.trim().length >= 3 ? (
                      <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 8 }}>No matches</Text>
                    ) : null
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.row, { borderColor: theme.colors.border }]}
                      onPress={() => void handleInvite(item.id)}
                      disabled={invitingId === item.id}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.textPrimary, fontWeight: "700" }}>{item.email}</Text>
                        {item.display_name ? (
                          <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>{item.display_name}</Text>
                        ) : null}
                      </View>
                      {invitingId === item.id ? (
                        <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                      ) : (
                        <Text style={{ color: theme.colors.cyan[400], fontWeight: "700" }}>Invite</Text>
                      )}
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          ) : (
            <>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 14, marginBottom: 14, lineHeight: 20 }}>
                Create a shared challenge from this mission. You stay on this habit; invitees get a matching habit when
                they accept.
              </Text>
              <Button title={creating ? "Creating…" : "Start group challenge"} onPress={() => void handleCreateGroup()} disabled={creating} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
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
  sheetTitle: { fontSize: 18, fontWeight: "800" },
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
