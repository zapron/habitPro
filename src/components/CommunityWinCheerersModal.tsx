import { Text } from "./AppText";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import { ThumbsUp, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { formatRelativeTime } from "../lib/communityWinFeedFormat";
import { listCommunityWinCheerers, type CommunityWinCheerer } from "../lib/communityWinsApi";
import { levelFromTotalXp } from "../utils/xpLevel";

function initialsFromUsername(username: string | null): string {
  if (!username || !username.trim()) return "?";
  const u = username.trim().toLowerCase();
  const parts = u.replace(/_/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (u.length >= 2) return u.slice(0, 2).toUpperCase();
  return u[0].toUpperCase();
}

/** Per row: avatar + 2 text lines + padding */
const CHEER_ROW_PX = 72;
/** Grabber row + close + hero + spacing (below sheet paddingTop). */
const SHEET_ABOVE_LIST_PX = 168;
const LIST_FALLBACK_PX = 140;
const LIST_MIN_PX = 100;
const SHEET_MAX_SCREEN_RATIO = 0.92;

type Props = {
  visible: boolean;
  winId: string | null;
  /** From feed card so the header matches before fetch completes. */
  totalLikes?: number | null;
  onClose: () => void;
};

export function CommunityWinCheerersModal({ visible, winId, totalLikes, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { theme, isDark } = useTheme();
  const levelPillBg = isDark ? "rgba(99, 102, 241, 0.14)" : "rgba(79, 70, 229, 0.08)";
  const levelPillBorder = isDark ? "rgba(129, 140, 248, 0.35)" : "rgba(99, 102, 241, 0.28)";
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CommunityWinCheerer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const headerCount = useMemo(() => {
    if (typeof totalLikes === "number" && totalLikes >= 0) return totalLikes;
    return items.length;
  }, [totalLikes, items.length]);

  const likesAccessibilityLabel = headerCount === 1 ? "1 like" : `${headerCount} likes`;

  const bottomPad = Math.max(insets.bottom, theme.spacing.md);

  const { listShellHeight, sheetMaxPx, sheetHeight } = useMemo(() => {
    const sheetMax = windowHeight * SHEET_MAX_SCREEN_RATIO;
    const innerAbove = theme.spacing.xs + SHEET_ABOVE_LIST_PX;
    const listCap = Math.max(LIST_MIN_PX, sheetMax - innerAbove - bottomPad);
    let naturalList: number;
    if (loading) {
      naturalList = LIST_FALLBACK_PX;
    } else if (error) {
      naturalList = LIST_FALLBACK_PX;
    } else if (items.length === 0) {
      naturalList = LIST_FALLBACK_PX;
    } else {
      naturalList = items.length * CHEER_ROW_PX + theme.spacing.sm;
    }
    const listH = Math.min(Math.max(naturalList, LIST_MIN_PX), listCap);
    const h = Math.min(innerAbove + listH + bottomPad, sheetMax);
    return { listShellHeight: listH, sheetMaxPx: sheetMax, sheetHeight: h };
  }, [
    windowHeight,
    theme.spacing.xs,
    theme.spacing.sm,
    bottomPad,
    loading,
    error,
    items.length,
  ]);

  useEffect(() => {
    if (!visible || !winId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    setError(null);
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        void (async () => {
          const res = await listCommunityWinCheerers(winId, 60);
          if (cancelled) return;
          if (res.ok === false) {
            setError(res.error);
            setItems([]);
          } else {
            setItems(res.items);
          }
          setLoading(false);
        })();
      }, 120);
    });
    return () => {
      cancelled = true;
      task.cancel?.();
      if (timer) clearTimeout(timer);
    };
  }, [visible, winId]);

  const heroCircleStyle = useMemo(
    () => [
      styles.heroCircle,
      {
        backgroundColor: theme.colors.indigo[600],
        ...(!isDark
          ? theme.shadow.card
          : {
              shadowColor: theme.colors.indigo[500],
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35,
              shadowRadius: 12,
              elevation: 6,
            }),
      },
    ],
    [isDark, theme.colors.indigo, theme.shadow.card],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: isDark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.22)",
            },
          ]}
          onPress={onClose}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
          style={[styles.kav, { paddingTop: insets.top }]}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                paddingHorizontal: theme.spacing.md + 4,
                paddingTop: theme.spacing.xs,
                paddingBottom: bottomPad,
                maxHeight: sheetMaxPx,
                height: sheetHeight,
                ...theme.shadow.card,
              },
            ]}
          >
            <View style={styles.grabberHeaderRow}>
              <View style={styles.grabberHeaderSide} />
              <View style={styles.grabberWrap} accessibilityRole="none">
                <View style={[styles.grabber, { backgroundColor: theme.colors.slate[600] }]} />
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={[
                  styles.closeBtn,
                  {
                    backgroundColor: theme.colors.surfaceElevated,
                    borderColor: theme.colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={theme.icon.lg} color={theme.colors.textSecondary} strokeWidth={2.2} />
              </Pressable>
            </View>

            <View
              style={styles.heroBlock}
              accessibilityRole="text"
              accessibilityLabel={likesAccessibilityLabel}
            >
              <View style={styles.heroMainRow}>
                <View style={heroCircleStyle}>
                  <ThumbsUp size={32} color={theme.colors.white} fill={theme.colors.white} strokeWidth={2} />
                </View>
                <View style={styles.heroNumberColumn}>
                  <Text
                    style={[
                      styles.heroCount,
                      {
                        color: theme.colors.textPrimary,
                        fontSize: theme.typography.h1 + 6,
                        letterSpacing: theme.letterSpacing.tight,
                      },
                    ]}
                  >
                    {headerCount}
                  </Text>
                  <Text
                    style={[
                      styles.heroLikesWord,
                      { color: theme.colors.textSecondary, fontSize: theme.typography.body },
                    ]}
                  >
                    {headerCount === 1 ? "Like" : "Likes"}
                  </Text>
                </View>
              </View>
              <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>
                People who liked this.
              </Text>
            </View>

            <View
              style={[
                styles.listShell,
                { borderTopColor: theme.colors.border, height: listShellHeight },
              ]}
            >
              {loading ? (
                <View style={[styles.center, { paddingVertical: theme.spacing.lg }]}>
                  <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                </View>
              ) : error ? (
                <View style={[styles.center, { paddingVertical: theme.spacing.lg }]}>
                  <Text
                    style={[
                      styles.error,
                      { color: theme.colors.textSecondary, fontSize: theme.typography.caption },
                    ]}
                  >
                    {error}
                  </Text>
                </View>
              ) : items.length === 0 ? (
                <View style={[styles.center, { paddingVertical: theme.spacing.lg }]}>
                  <Text
                    style={[
                      styles.empty,
                      { color: theme.colors.textSecondary, fontSize: theme.typography.caption },
                    ]}
                  >
                    No likes yet.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.listScroll}
                  contentContainerStyle={[
                    styles.list,
                    { paddingBottom: theme.spacing.sm, flexGrow: 1 },
                  ]}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {items.map((c, index) => {
                    const level = levelFromTotalXp(c.xp);
                    const isLast = index === items.length - 1;
                    const sub =
                      c.cheeredAt != null
                        ? `Liked · ${formatRelativeTime(c.cheeredAt)}`
                        : "Supporter";
                    return (
                      <View
                        key={`${c.userId}:${c.cheeredAt ?? ""}`}
                        style={[
                          styles.row,
                          {
                            paddingVertical: theme.spacing.sm + 2,
                            paddingHorizontal: theme.spacing.xs,
                            borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                            borderBottomColor: theme.colors.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.rowAvatar,
                            {
                              backgroundColor: theme.colors.surfaceElevated,
                              borderColor: theme.colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.rowAvatarInitials, { color: theme.colors.textSecondary }]}>
                            {initialsFromUsername(c.username)}
                          </Text>
                        </View>
                        <View style={styles.rowTextCol}>
                          <Text
                            style={[
                              styles.rowHandle,
                              {
                                color: theme.colors.cyan[400],
                                fontSize: theme.typography.body,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {c.username ? `@${c.username}` : "Someone"}
                          </Text>
                          <Text
                            style={[styles.rowSubline, { color: theme.colors.textMuted }]}
                            numberOfLines={1}
                          >
                            {sub}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.levelPill,
                            {
                              backgroundColor: levelPillBg,
                              borderColor: levelPillBorder,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.levelPillText,
                              {
                                color: theme.colors.indigo[400],
                                fontSize: theme.typography.micro,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            Level {level}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  kav: {
    flex: 1,
    justifyContent: "flex-end",
    maxHeight: "100%",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
  },
  grabberHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  grabberHeaderSide: {
    width: 40,
    height: 40,
  },
  grabberWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 4,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroBlock: {
    alignItems: "center",
    marginBottom: 16,
  },
  heroMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 8,
  },
  heroCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  heroNumberColumn: {
    justifyContent: "center",
    gap: 0,
  },
  heroCount: {
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    lineHeight: 40,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  heroLikesWord: {
    fontWeight: "700",
    marginTop: -4,
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  listShell: {
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  listScroll: {
    flex: 1,
  },
  center: {
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { fontWeight: "700", textAlign: "center", lineHeight: 20 },
  empty: { fontWeight: "600", textAlign: "center", lineHeight: 20 },
  list: {},
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowAvatarInitials: {
    fontSize: 14,
    fontWeight: "800",
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowHandle: {
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  rowSubline: {
    fontSize: 12,
    fontWeight: "600",
  },
  levelPill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
    flexShrink: 0,
  },
  levelPillText: {
    fontWeight: "800",
    letterSpacing: 0.12,
    fontVariant: ["tabular-nums"],
  },
});
