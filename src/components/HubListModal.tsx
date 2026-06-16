import { Text } from "./AppText";
import {
  Modal,
  View,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { X, Globe, User } from "lucide-react-native";
import type { Habit, MiniMission } from "../types/habit";
import { useTheme } from "../context/ThemeContext";
import { getMiniMissionDisplayStatus } from "../utils/miniMissionTime";

export type HubListModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  emptyHint: string;
} & (
  | { variant: "habits"; items: Habit[] }
  | { variant: "minis"; items: MiniMission[] }
);

function miniStatusLabel(m: MiniMission, now: number): string {
  switch (getMiniMissionDisplayStatus(m, now)) {
    case "done":
      return "Done";
    case "active":
      return "Active";
    case "queued":
      return "Queued";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Active";
  }
}

function miniStatusColor(m: MiniMission, now: number, theme: ReturnType<typeof useTheme>["theme"]): string {
  const status = getMiniMissionDisplayStatus(m, now);
  if (status === "done" || status === "cancelled") return theme.colors.textMuted;
  if (status === "failed") return theme.colors.red[500];
  if (status === "queued") return theme.colors.indigo[400];
  return theme.colors.amber[500];
}

export function HubListModal(props: HubListModalProps) {
  const { visible, onClose, title, emptyHint } = props;
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const renderHabit = ({ item }: { item: Habit }) => {
    const VisIcon = item.visibility === "public" ? Globe : User;
    const visColor = item.visibility === "public" ? theme.colors.cyan[400] : theme.colors.indigo[400];
    return (
      <TouchableOpacity
        style={[rowStyles.row, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
        onPress={() => {
          router.push(`/habit/${item.id}`);
          onClose();
        }}
        activeOpacity={0.85}
      >
        <View style={rowStyles.rowMain}>
          <Text style={[rowStyles.rowTitle, { color: theme.colors.textPrimary }]} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={rowStyles.badges}>
            <View style={[rowStyles.pill, { borderColor: theme.colors.border }]}>
              <VisIcon size={12} color={visColor} />
              <Text style={[rowStyles.pillText, { color: theme.colors.textMuted }]}>
                {item.visibility === "public" ? "Public" : "Solo"}
              </Text>
            </View>
            <Text style={[rowStyles.status, { color: item.isCompleted ? theme.colors.textMuted : theme.colors.cyan[400] }]}>
              {item.isCompleted ? "Done" : "Active"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMini = ({ item }: { item: MiniMission }) => {
    const VisIcon = item.visibility === "public" ? Globe : User;
    const visColor = item.visibility === "public" ? theme.colors.cyan[400] : theme.colors.indigo[400];
    const now = Date.now();
    return (
      <TouchableOpacity
        style={[rowStyles.row, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
        onPress={() => {
          router.push(`/mini/${item.id}`);
          onClose();
        }}
        activeOpacity={0.85}
      >
        <View style={rowStyles.rowMain}>
          <Text style={[rowStyles.rowTitle, { color: theme.colors.textPrimary }]} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={rowStyles.badges}>
            <View style={[rowStyles.pill, { borderColor: theme.colors.border }]}>
              <VisIcon size={12} color={visColor} />
              <Text style={[rowStyles.pillText, { color: theme.colors.textMuted }]}>
                {item.visibility === "public" ? "Public" : "Solo"}
              </Text>
            </View>
            <Text style={[rowStyles.status, { color: miniStatusColor(item, now, theme) }]}>
              {miniStatusLabel(item, now)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const empty = props.items.length === 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: theme.colors.background, paddingTop: Math.max(insets.top, 12) }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close list"
          >
            <X size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {empty ? (
          <View style={[styles.emptyWrap, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>{emptyHint}</Text>
          </View>
        ) : props.variant === "habits" ? (
          <FlatList<Habit>
            data={props.items}
            keyExtractor={(item) => item.id}
            renderItem={renderHabit}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom, 20) + 8 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        ) : (
          <FlatList<MiniMission>
            data={props.items}
            keyExtractor={(item) => item.id}
            renderItem={renderMini}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom, 20) + 8 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800" },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  listContent: { paddingHorizontal: 16, paddingTop: 12 },
  emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28 },
  emptyText: { fontSize: 15, textAlign: "center", lineHeight: 22 },
});

const rowStyles = StyleSheet.create({
  row: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  rowMain: { gap: 8 },
  rowTitle: { fontSize: 16, fontWeight: "700" },
  badges: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
  },
  pillText: { fontSize: 11, fontWeight: "700" },
  status: { fontSize: 12, fontWeight: "800" },
});
