import { Text } from "../../src/components/AppText";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Vibration,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Clock3,
  Check,
  Trash2,
  CircleX,
  Trophy,
  Fuel,
  Flame,
  Sparkles,
  Info,
  Maximize2,
  Minimize2,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { setActiveMiniMissionNotificationContext } from "../../src/utils/notifications";
import {
  clearMiniMissionNotifications,
  syncMiniMissionNotifications,
} from "../../src/utils/miniMissionNotifications";
import { Screen } from "../../src/components/Screen";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { Button } from "../../src/components/Button";
import { CoachMarkTarget, useCoachMark } from "../../src/context/CoachMarkContext";
import { MissionDetailsSheet } from "../../src/components/MissionDetailsSheet";
import { StreakMemorySheet } from "../../src/components/StreakMemorySheet";
import { MiniMissionFireProgressBar } from "../../src/components/MiniMissionFireProgressBar";
import { MiniMissionFlightCountdown } from "../../src/components/MiniMissionFlightCountdown";
import { remainingMsToProgressiveCountdown } from "../../src/utils/flightCountdownDisplay";
import { useTheme } from "../../src/context/ThemeContext";
import { useHabitStore } from "../../src/store/habitStore";
import type { MissionVisibility, StreakMemory } from "../../src/types/habit";
import {
  subscribeSyncFailure,
  subscribeSyncSuccess,
} from "../../src/lib/syncQueue";
import { useAuth } from "../../src/context/AuthContext";
import { usePremium } from "../../src/context/PremiumContext";
import { usePlusUpsell } from "../../src/context/PlusUpsellContext";
import { useRefreshPremiumAccess } from "../../src/hooks/useRefreshPremiumAccess";
import { useUsernameGate } from "../../src/context/UsernameGateContext";
import { useNotificationGate } from "../../src/context/NotificationGateContext";
import { isSupabaseConfigured } from "../../src/lib/env";
import { MiniVisibilityRow } from "../../src/components/MiniVisibilityRow";
import {
  deleteCommunityWin,
  postCommunityWin,
} from "../../src/lib/communityWinsApi";
import { MAX_RESERVE_FUEL_MINUTES } from "../../src/constants/miniMission";
import {
  MINI_MISSION_DETAIL_KEEP_AWAKE_TAG,
  MINI_MISSION_KEEP_SCREEN_ON_KEY,
} from "../../src/constants/miniMissionKeepAwake";
import {
  canUseStreakMemoryUpload,
  shouldUploadLocalStreakImage,
  uploadMiniStreakMemoryImage,
} from "../../src/lib/streakMemoryStorage";

// Notification handler is configured globally in _layout.tsx via setupNotifications()

const QUOTES = [
  {
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
  },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Small steps every day lead to big results.", author: "Unknown" },
  {
    text: "You don't have to be great to start, but you have to start to be great.",
    author: "Zig Ziglar",
  },
  {
    text: "The only way to do great work is to love what you do.",
    author: "Steve Jobs",
  },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  {
    text: "Discipline is choosing between what you want now and what you want most.",
    author: "Abraham Lincoln",
  },
  {
    text: "It always seems impossible until it's done.",
    author: "Nelson Mandela",
  },
  {
    text: "Action is the foundational key to all success.",
    author: "Pablo Picasso",
  },
  {
    text: "What we do today determines where we'll be tomorrow.",
    author: "Unknown",
  },
  { text: "Progress, not perfection.", author: "Unknown" },
  {
    text: "You are one decision away from a completely different life.",
    author: "Unknown",
  },
];

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

/** Survives screen unmount so reopening the card does not re-fire "time's up" for the same timer window. */
const foregroundExpiryNotifiedEndMsByMissionId = new Map<string, number>();

function getPlannedEndMs(m: {
  startedAt?: string;
  estimatedMinutes: number;
  extendedMinutes?: number;
}): number {
  if (!m.startedAt) return 0;
  const totalMinutes = m.estimatedMinutes + (m.extendedMinutes ?? 0);
  return new Date(m.startedAt).getTime() + totalMinutes * 60 * 1000;
}

function buildSpiralRanks(
  rows: number,
  columns: number,
  totalCells: number,
): number[] {
  const ranks = Array(totalCells).fill(totalCells);
  let rank = 0;
  let top = 0;
  let bottom = rows - 1;
  let left = 0;
  let right = columns - 1;

  const addCell = (row: number, column: number) => {
    const index = row * columns + column;
    if (index < 0 || index >= totalCells) return;
    ranks[index] = rank;
    rank += 1;
  };

  while (top <= bottom && left <= right) {
    for (let column = left; column <= right; column += 1) {
      addCell(top, column);
    }
    top += 1;

    for (let row = top; row <= bottom; row += 1) {
      addCell(row, right);
    }
    right -= 1;

    if (top <= bottom) {
      for (let column = right; column >= left; column -= 1) {
        addCell(bottom, column);
      }
      bottom -= 1;
    }

    if (left <= right) {
      for (let row = bottom; row >= top; row -= 1) {
        addCell(row, left);
      }
      left += 1;
    }
  }

  return ranks;
}

function getFocusMatrixCellCount(totalSeconds: number): number {
  if (totalSeconds <= 720) return totalSeconds;
  if (totalSeconds <= 60 * 60) return 720;
  if (totalSeconds <= 4 * 60 * 60) return 600;
  return 420;
}

function getFocusActiveCellCount(
  remainingSeconds: number,
  matrixSeconds: number,
  totalCells: number,
): number {
  const clampedRemaining = Math.min(
    Math.max(0, remainingSeconds),
    Math.max(1, matrixSeconds),
  );
  return Math.min(
    totalCells,
    Math.ceil((clampedRemaining / Math.max(1, matrixSeconds)) * totalCells),
  );
}

type FocusGridPalette = {
  name: string;
  dark: {
    cell: string;
    shadow: string;
    label: string;
    border: string;
  };
  light: {
    cell: string;
    shadow: string;
    label: string;
    border: string;
  };
};

const FOCUS_GRID_PALETTES: FocusGridPalette[] = [
  {
    name: "Violet",
    dark: {
      cell: "#ddd6fe",
      shadow: "#c4b5fd",
      label: "rgba(221, 214, 254, 0.8)",
      border: "rgba(221, 214, 254, 0.22)",
    },
    light: {
      cell: "#8b5cf6",
      shadow: "#a78bfa",
      label: "rgba(109, 40, 217, 0.78)",
      border: "rgba(139, 92, 246, 0.2)",
    },
  },
  {
    name: "Indigo",
    dark: {
      cell: "#c4b5fd",
      shadow: "#a78bfa",
      label: "rgba(199, 210, 254, 0.8)",
      border: "rgba(196, 181, 253, 0.24)",
    },
    light: {
      cell: "#4f46e5",
      shadow: "#6366f1",
      label: "rgba(67, 56, 202, 0.78)",
      border: "rgba(79, 70, 229, 0.2)",
    },
  },
  {
    name: "Blue",
    dark: {
      cell: "#93c5fd",
      shadow: "#93c5fd",
      label: "rgba(191, 219, 254, 0.78)",
      border: "rgba(147, 197, 253, 0.23)",
    },
    light: {
      cell: "#2563eb",
      shadow: "#3b82f6",
      label: "rgba(29, 78, 216, 0.76)",
      border: "rgba(37, 99, 235, 0.2)",
    },
  },
  {
    name: "Green",
    dark: {
      cell: "#86efac",
      shadow: "#86efac",
      label: "rgba(187, 247, 208, 0.78)",
      border: "rgba(134, 239, 172, 0.22)",
    },
    light: {
      cell: "#16a34a",
      shadow: "#22c55e",
      label: "rgba(21, 128, 61, 0.78)",
      border: "rgba(22, 163, 74, 0.2)",
    },
  },
  {
    name: "Yellow",
    dark: {
      cell: "#fde68a",
      shadow: "#facc15",
      label: "rgba(254, 240, 138, 0.78)",
      border: "rgba(253, 230, 138, 0.22)",
    },
    light: {
      cell: "#ca8a04",
      shadow: "#eab308",
      label: "rgba(133, 77, 14, 0.78)",
      border: "rgba(202, 138, 4, 0.2)",
    },
  },
  {
    name: "Orange",
    dark: {
      cell: "#fdba74",
      shadow: "#fb923c",
      label: "rgba(254, 215, 170, 0.78)",
      border: "rgba(253, 186, 116, 0.22)",
    },
    light: {
      cell: "#ea580c",
      shadow: "#f97316",
      label: "rgba(154, 52, 18, 0.76)",
      border: "rgba(234, 88, 12, 0.18)",
    },
  },
  {
    name: "Red",
    dark: {
      cell: "#fca5a5",
      shadow: "#f87171",
      label: "rgba(254, 202, 202, 0.78)",
      border: "rgba(252, 165, 165, 0.22)",
    },
    light: {
      cell: "#dc2626",
      shadow: "#ef4444",
      label: "rgba(185, 28, 28, 0.76)",
      border: "rgba(220, 38, 38, 0.18)",
    },
  },
];

type FocusSecondCellProps = {
  active: boolean;
  color: string;
  size: number;
  shadowColor: string;
  animate: boolean;
  glow: boolean;
};

const FocusSecondCell = memo(function FocusSecondCell({
  active,
  color,
  size,
  shadowColor,
  animate,
  glow,
}: FocusSecondCellProps) {
  const visibility = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    if (!animate) {
      visibility.setValue(active ? 1 : 0);
      return;
    }
    Animated.timing(visibility, {
      toValue: active ? 1 : 0,
      duration: active ? 720 : 620,
      easing: active ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [active, animate, visibility]);

  const opacity = visibility.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.9],
  });
  const scale = visibility.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });

  return (
    <Animated.View
      style={[
        focusStyles.secondCell,
        {
          width: size,
          height: size,
          borderRadius: Math.max(3, size * 0.28),
          borderColor: color,
          backgroundColor: color,
          shadowColor,
          shadowOpacity: active && glow ? 0.12 : 0,
          elevation: active && glow ? 2 : 0,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
});

type FocusSecondsMatrixProps = {
  countdownMs: number;
  totalMissionSeconds: number;
  baseMissionSeconds: number;
  totalMinutes: number;
  reserveUsed: number;
  isTimerUp: boolean;
  isWide: boolean;
};

function FocusSecondsMatrix({
  countdownMs,
  totalMissionSeconds,
  baseMissionSeconds,
  totalMinutes,
  reserveUsed,
  isTimerUp,
  isWide,
}: FocusSecondsMatrixProps) {
  const { isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  const [paletteIndex, setPaletteIndex] = useState(0);
  const remainingSeconds = Math.max(0, Math.ceil(countdownMs / 1000));
  const palette = FOCUS_GRID_PALETTES[paletteIndex % FOCUS_GRID_PALETTES.length];
  const paletteColors = isDark ? palette.dark : palette.light;
  const cycleFocusPalette = useCallback(() => {
    void Haptics.selectionAsync();
    setPaletteIndex((current) => (current + 1) % FOCUS_GRID_PALETTES.length);
  }, []);
  // Keep the grid as the original mission container. Reserve fuel refills
  // vanished dots instead of adding new cells or changing the layout.
  const matrixSeconds = Math.max(1, baseMissionSeconds);
  const totalCells = Math.min(
    matrixSeconds,
    getFocusMatrixCellCount(matrixSeconds),
  );
  const activeCells = getFocusActiveCellCount(
    remainingSeconds,
    matrixSeconds,
    totalCells,
  );
  const cellColor = isTimerUp
    ? isDark
      ? "#ef4444"
      : "#dc2626"
    : remainingSeconds <= 10
      ? isDark
        ? "#fb7185"
        : "#e11d48"
        : remainingSeconds <= 30
          ? isDark
            ? "#f59e0b"
            : "#d97706"
          : paletteColors.cell;
  const gap = totalCells <= 120 ? 5 : totalCells <= 300 ? 4 : 3;
  const animateCells = totalCells <= 300;
  const maxGridWidth = isWide
    ? Math.min(Math.max(width - 360, 320), 760)
    : Math.min(Math.max(width - 60, 280), 390);
  const maxGridHeight = isWide
    ? Math.max(height - 180, 220)
    : Math.min(Math.max(height - 250, 280), 560);
  const gridLayout = useMemo(() => {
    const minColumns = Math.min(totalCells, isWide ? 12 : 10);
    const maxColumns = Math.min(totalCells, isWide ? 60 : 48);
    let best = {
      columns: minColumns,
      rows: Math.ceil(totalCells / Math.max(1, minColumns)),
      cellSize: 4,
    };

    for (let candidate = minColumns; candidate <= maxColumns; candidate += 1) {
      const candidateRows = Math.ceil(totalCells / candidate);
      const byWidth = Math.floor(
        (maxGridWidth - (candidate - 1) * gap) / candidate,
      );
      const byHeight = Math.floor(
        (maxGridHeight - (candidateRows - 1) * gap) / candidateRows,
      );
      const candidateSize = Math.max(4, Math.min(byWidth, byHeight));
      const bestArea = best.cellSize * best.cellSize;
      const candidateArea = candidateSize * candidateSize;
      const candidateGridHeight =
        candidateRows * candidateSize + (candidateRows - 1) * gap;
      const bestGridHeight = best.rows * best.cellSize + (best.rows - 1) * gap;
      const candidateGridWidth =
        candidate * candidateSize + (candidate - 1) * gap;
      const bestGridWidth =
        best.columns * best.cellSize + (best.columns - 1) * gap;
      const widthFillDelta = maxGridWidth - candidateGridWidth;
      const bestWidthFillDelta = maxGridWidth - bestGridWidth;

      if (
        candidateArea > bestArea ||
        (candidateArea === bestArea &&
          (widthFillDelta < bestWidthFillDelta ||
            (widthFillDelta === bestWidthFillDelta &&
              candidateGridHeight > bestGridHeight)))
      ) {
        best = {
          columns: candidate,
          rows: candidateRows,
          cellSize: candidateSize,
        };
      }
    }

    return {
      ...best,
      width: best.columns * best.cellSize + (best.columns - 1) * gap,
    };
  }, [gap, isWide, maxGridHeight, maxGridWidth, totalCells]);
  const columns = gridLayout.columns;
  const rows = gridLayout.rows;
  const spiralRanks = useMemo(
    () => buildSpiralRanks(rows, columns, totalCells),
    [rows, columns, totalCells],
  );
  const elapsedCells = totalCells - activeCells;
  const cellSize = gridLayout.cellSize;
  const glowCells = totalCells <= 240 && cellSize >= 5;
  const displaySeconds = Math.max(1, totalMissionSeconds);
  const remainingLabel =
    displaySeconds <= 999
      ? `${remainingSeconds}`
      : `${Math.ceil(remainingSeconds / 60)}m`;
  const totalLabel =
    displaySeconds <= 999
      ? `${displaySeconds}`
      : `${Math.ceil(displaySeconds / 60)}m`;
  const cardColors = isDark
    ? {
        bg: "#0b1f27",
        border: paletteColors.border,
        label: paletteColors.label,
        detail: "rgba(203, 213, 225, 0.72)",
        detailValue: "#e2e8f0",
        valueMuted: "rgba(203, 213, 225, 0.52)",
        shadow: paletteColors.shadow,
      }
    : {
        bg: "#ffffff",
        border: paletteColors.border,
        label: paletteColors.label,
        detail: "rgba(71, 85, 105, 0.72)",
        detailValue: "#334155",
        valueMuted: "rgba(71, 85, 105, 0.45)",
        shadow: paletteColors.shadow,
      };

  return (
    <View
      style={[
        focusStyles.secondsDeck,
        {
          backgroundColor: cardColors.bg,
          borderColor: cardColors.border,
        },
      ]}
    >
      <View style={focusStyles.secondsHeader}>
        <View style={focusStyles.secondsTitleCol}>
          <Text style={[focusStyles.secondsKicker, { color: cardColors.label }]}>
            Time
          </Text>
          <Text style={focusStyles.secondsValue}>
            <Text style={{ color: cellColor }}>{remainingLabel}</Text>
            <Text style={{ color: cardColors.valueMuted }}>/{totalLabel}</Text>
          </Text>
        </View>
        <View style={focusStyles.secondsMeta}>
          <View style={focusStyles.secondsMetaItem}>
            <Text style={[focusStyles.secondsMetaValue, { color: cardColors.detailValue }]}>
              {totalMinutes}
            </Text>
            <Text style={[focusStyles.secondsMetaLabel, { color: cardColors.detail }]}>
              MIN
            </Text>
          </View>
          <View
            style={[
              focusStyles.secondsMetaDivider,
              { backgroundColor: cardColors.valueMuted },
            ]}
          />
          <View style={focusStyles.secondsMetaItem}>
            <Text style={[focusStyles.secondsMetaValue, { color: cardColors.detailValue }]}>
              {reserveUsed}/{MAX_RESERVE_FUEL_MINUTES}
            </Text>
            <Text style={[focusStyles.secondsMetaLabel, { color: cardColors.detail }]}>
              RSV
            </Text>
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Change focus grid color. Current color ${palette.name}.`}
        onPress={cycleFocusPalette}
        style={[focusStyles.secondsGrid, { width: gridLayout.width }]}
      >
        {Array.from({ length: rows }, (_, row) => (
          <View
            key={row}
            style={[
              focusStyles.secondsGridRow,
              row < rows - 1 ? { marginBottom: gap } : null,
            ]}
          >
            {Array.from({ length: columns }, (_, column) => {
              const index = row * columns + column;
              if (index >= totalCells) {
                return (
                  <View
                    key={column}
                    style={[
                      {
                        width: cellSize,
                        height: cellSize,
                      },
                      column < columns - 1 ? { marginRight: gap } : null,
                    ]}
                  />
                );
              }
              return (
                <View
                  key={column}
                  style={column < columns - 1 ? { marginRight: gap } : null}
                >
                  <FocusSecondCell
                    active={spiralRanks[index] >= elapsedCells}
                    color={cellColor}
                    size={cellSize}
                    shadowColor={cardColors.shadow}
                    animate={animateCells}
                    glow={glowCells}
                  />
                </View>
              );
            })}
          </View>
        ))}
      </Pressable>
    </View>
  );
}

type FocusMissionControlModalProps = {
  visible: boolean;
  title: string;
  countdownMs: number;
  totalMinutes: number;
  baseMissionSeconds: number;
  reserveSlotsAvailable: number;
  reserveUsed: number;
  reserveFull: boolean;
  isTimerUp: boolean;
  onClose: () => void;
  onReserveFuel: () => void;
  onMarkComplete: () => void;
};

function FocusMissionControlModal({
  visible,
  title,
  countdownMs,
  totalMinutes,
  baseMissionSeconds,
  reserveSlotsAvailable,
  reserveUsed,
  reserveFull,
  isTimerUp,
  onClose,
  onReserveFuel,
  onMarkComplete,
}: FocusMissionControlModalProps) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isWide = width > height && width >= 680;
  const actionDisabled = isTimerUp;
  const focusColors = isDark
    ? {
        bg: "#07111a",
        title: "#f8fafc",
        closeBg: "rgba(15, 23, 42, 0.78)",
        closeBorder: "rgba(148, 163, 184, 0.28)",
        closeIcon: "#f8fafc",
        reserveBg: "rgba(251, 191, 36, 0.12)",
        reserveBorder: "rgba(251, 191, 36, 0.38)",
        reserveText: "#fbbf24",
        completeBg: "rgba(34, 197, 94, 0.16)",
        completeBorder: "rgba(34, 197, 94, 0.38)",
        completeIcon: "#22c55e",
        disabled: "#94a3b8",
      }
    : {
        bg: "#f6faf8",
        title: "#0f172a",
        closeBg: "rgba(255, 255, 255, 0.88)",
        closeBorder: "rgba(100, 116, 139, 0.24)",
        closeIcon: "#334155",
        reserveBg: "rgba(245, 158, 11, 0.11)",
        reserveBorder: "rgba(217, 119, 6, 0.34)",
        reserveText: "#d97706",
        completeBg: "rgba(22, 163, 74, 0.12)",
        completeBorder: "rgba(22, 163, 74, 0.32)",
        completeIcon: "#16a34a",
        disabled: "#94a3b8",
      };
  const reserveDisabled = reserveFull || isTimerUp || reserveSlotsAvailable <= 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      supportedOrientations={[
        "portrait",
        "landscape",
        "landscape-left",
        "landscape-right",
      ]}
      onRequestClose={onClose}
    >
      <StatusBar
        hidden
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={focusColors.bg}
      />
      <View
        style={[
          focusStyles.root,
          {
            backgroundColor: focusColors.bg,
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 14),
            paddingHorizontal: isWide ? 22 : 16,
          },
        ]}
      >
        <View style={focusStyles.titleLine}>
          <View style={focusStyles.topCopy}>
            <Text
              style={[
                focusStyles.focusTitle,
                isWide && focusStyles.focusTitleWide,
                { color: focusColors.title },
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              focusStyles.topReserveButton,
              {
                backgroundColor: focusColors.reserveBg,
                borderColor: focusColors.reserveBorder,
              },
              reserveDisabled && focusStyles.actionDisabled,
            ]}
            onPress={onReserveFuel}
            disabled={reserveDisabled}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityLabel="Add one minute reserve fuel"
          >
            <Fuel
              size={17}
              color={
                reserveDisabled
                  ? focusColors.disabled
                  : focusColors.reserveText
              }
            />
            <Text
              style={[
                focusStyles.topReserveText,
                {
                  color:
                    reserveDisabled
                      ? focusColors.disabled
                      : focusColors.reserveText,
                },
              ]}
            >
              +1
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              focusStyles.completeIconButton,
              {
                backgroundColor: focusColors.completeBg,
                borderColor: focusColors.completeBorder,
              },
              actionDisabled && focusStyles.actionDisabled,
            ]}
            onPress={onMarkComplete}
            disabled={actionDisabled}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityLabel="Mark mission complete"
          >
            <Check size={22} color={focusColors.completeIcon} strokeWidth={3} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              focusStyles.closeButton,
              {
                backgroundColor: focusColors.closeBg,
                borderColor: focusColors.closeBorder,
              },
            ]}
            onPress={onClose}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Close focus mode"
          >
            <Minimize2 size={20} color={focusColors.closeIcon} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={focusStyles.focusScroll}
          contentContainerStyle={[
            focusStyles.body,
            isWide && focusStyles.bodyWide,
            {
              minHeight: Math.max(
                0,
                height -
                  Math.max(insets.top, 12) -
                  Math.max(insets.bottom, 14) -
                  (isWide ? 82 : 120),
              ),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Dots-only Focus Mode test: big timer render is temporarily disabled. */}

          <View style={[focusStyles.rail, isWide && focusStyles.railWide]}>
            <FocusSecondsMatrix
              countdownMs={countdownMs}
              totalMissionSeconds={Math.max(1, totalMinutes * 60)}
              baseMissionSeconds={baseMissionSeconds}
              totalMinutes={totalMinutes}
              reserveUsed={reserveUsed}
              isTimerUp={isTimerUp}
              isWide={isWide}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function MiniMissionDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { session } = useAuth();
  const { isPremium, loading: premiumLoading } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const refreshPremiumAccess = useRefreshPremiumAccess();
  const { requireUsername } = useUsernameGate();
  const { softAskNotifications } = useNotificationGate();
  const socialLocked = !isPremium || premiumLoading;
  const missionId = Array.isArray(id) ? id[0] : id;
  const scrollBottomPad = Math.max(insets.bottom, 16) + 16;

  const mission = useHabitStore((state) =>
    missionId ? state.getMiniMission(missionId) : undefined,
  );
  const startMiniMission = useHabitStore((state) => state.startMiniMission);
  const completeMiniMission = useHabitStore(
    (state) => state.completeMiniMission,
  );
  const extendMiniMission = useHabitStore((state) => state.extendMiniMission);
  const cancelMiniMission = useHabitStore((state) => state.cancelMiniMission);
  const retryFailedMiniMission = useHabitStore(
    (state) => state.retryFailedMiniMission,
  );
  const deleteMiniMission = useHabitStore((state) => state.deleteMiniMission);
  const setMiniMissionVisibility = useHabitStore(
    (state) => state.setMiniMissionVisibility,
  );
  const setMiniMissionCommunityFeedRevoked = useHabitStore(
    (state) => state.setMiniMissionCommunityFeedRevoked,
  );

  const lastVisibilityRef = useRef<{
    id: string;
    prev: MissionVisibility;
  } | null>(null);
  const startPromptBusyRef = useRef(false);
  const [completeSheetOpen, setCompleteSheetOpen] = useState(false);
  /** Wall time when user tapped Mark Complete — freezes countdown until sheet closes or mission completes. */
  const [timerFrozenAtMs, setTimerFrozenAtMs] = useState<number | null>(null);
  /** Avoid not-found flash after delete; mission is removed before navigation finishes. */
  const [pendingExitAfterRemove, setPendingExitAfterRemove] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [missionDetailsOpen, setMissionDetailsOpen] = useState(false);
  const [completionImageAspect, setCompletionImageAspect] = useState<number | null>(null);
  const [completionImageOpen, setCompletionImageOpen] = useState(false);
  const [keepScreenOn, setKeepScreenOn] = useState(false);
  const [focusModeOpen, setFocusModeOpen] = useState(false);

  const completionImageUri = useMemo(() => {
    return mission?.completionMemory?.imageUrl ?? mission?.completionMemory?.imageUri ?? null;
  }, [mission?.completionMemory?.imageUrl, mission?.completionMemory?.imageUri]);

  useEffect(() => {
    // Reset when switching missions / images so we don't reuse an old aspect ratio.
    setCompletionImageAspect(null);
    setCompletionImageOpen(false);
  }, [completionImageUri]);

  useEffect(() => {
    const unsubFail = subscribeSyncFailure(() => {
      const p = lastVisibilityRef.current;
      if (!p || !missionId || p.id !== missionId) return;
      setMiniMissionVisibility(p.id, p.prev);
      lastVisibilityRef.current = null;
    });
    const unsubOk = subscribeSyncSuccess(() => {
      lastVisibilityRef.current = null;
    });
    return () => {
      unsubFail();
      unsubOk();
    };
  }, [missionId, setMiniMissionVisibility]);

  useEffect(() => {
    return () => {
      lastVisibilityRef.current = null;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshPremiumAccess();
    }, [refreshPremiumAccess]),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      AsyncStorage.getItem(MINI_MISSION_KEEP_SCREEN_ON_KEY)
        .then((v) => {
          if (active) setKeepScreenOn(v === "true");
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  const [now, setNow] = useState(Date.now());
  const totalMinutes = mission
    ? mission.estimatedMinutes + (mission.extendedMinutes ?? 0)
    : 0;

  // Motivational quotes
  const [quoteIdx, setQuoteIdx] = useState(() =>
    Math.floor(Math.random() * QUOTES.length),
  );
  const quoteIdxRef = useRef(quoteIdx);
  quoteIdxRef.current = quoteIdx;
  const quoteFade = useRef(new Animated.Value(1)).current;

  const animateQuoteChange = useCallback(
    (nextIdx: number) => {
      Animated.timing(quoteFade, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setQuoteIdx(nextIdx);
        Animated.timing(quoteFade, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    },
    [quoteFade],
  );

  // Auto-rotate quotes every 5s when in progress (pause while memory sheet is open)
  useEffect(() => {
    if (mission?.status !== "in_progress" || completeSheetOpen) return;
    const interval = setInterval(() => {
      const next = (quoteIdxRef.current + 1) % QUOTES.length;
      animateQuoteChange(next);
    }, 5000);
    return () => clearInterval(interval);
  }, [mission?.status, completeSheetOpen, animateQuoteChange]);

  useEffect(() => {
    if (mission?.status !== "in_progress" || completeSheetOpen) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const plannedEndMs = mission.startedAt
      ? new Date(mission.startedAt).getTime() + totalMinutes * 60 * 1000
      : Date.now() + totalMinutes * 60 * 1000;

    const tick = () => {
      if (cancelled) return;
      const current = Date.now();
      setNow(current);

      const remaining = Math.max(0, plannedEndMs - current);
      if (remaining <= 0) return;

      const untilDisplayedSecondChanges = remaining % 1000 || 1000;
      timeout = setTimeout(
        tick,
        Math.max(16, untilDisplayedSecondChanges),
      );
    };

    tick();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [
    mission?.id,
    mission?.status,
    mission?.startedAt,
    totalMinutes,
    completeSheetOpen,
  ]);

  const countdown = useMemo(() => {
    if (!mission?.startedAt) return totalMinutes * 60 * 1000;
    const startMs = new Date(mission.startedAt).getTime();
    const endMs = startMs + totalMinutes * 60 * 1000;
    const nowAnchor =
      mission.status === "completed" && mission.completedAt
        ? new Date(mission.completedAt).getTime()
        : completeSheetOpen && timerFrozenAtMs !== null
          ? timerFrozenAtMs
          : now;
    return Math.max(0, endMs - nowAnchor);
  }, [mission, now, totalMinutes, completeSheetOpen, timerFrozenAtMs]);

  const isTimerUp = mission?.status === "in_progress" && countdown === 0;

  useEffect(() => {
    let cancelled = false;
    const shouldKeepAwake =
      isFocused &&
      keepScreenOn &&
      mission?.status === "in_progress" &&
      !isTimerUp;

    (async () => {
      await deactivateKeepAwake(MINI_MISSION_DETAIL_KEEP_AWAKE_TAG);
      if (cancelled || !shouldKeepAwake) return;
      await activateKeepAwakeAsync(MINI_MISSION_DETAIL_KEEP_AWAKE_TAG);
    })();

    return () => {
      cancelled = true;
      void deactivateKeepAwake(MINI_MISSION_DETAIL_KEEP_AWAKE_TAG);
    };
  }, [isFocused, keepScreenOn, mission?.status, isTimerUp]);

  useEffect(() => {
    const focusKeepAwakeTag = `${MINI_MISSION_DETAIL_KEEP_AWAKE_TAG}:focus`;
    const shouldKeepAwake =
      focusModeOpen && mission?.status === "in_progress" && !isTimerUp;

    if (!shouldKeepAwake) {
      void deactivateKeepAwake(focusKeepAwakeTag);
      return;
    }

    void activateKeepAwakeAsync(focusKeepAwakeTag);
    return () => {
      void deactivateKeepAwake(focusKeepAwakeTag);
    };
  }, [focusModeOpen, mission?.status, isTimerUp]);

  useEffect(() => {
    if (focusModeOpen && mission?.status !== "in_progress") {
      setFocusModeOpen(false);
    }
  }, [focusModeOpen, mission?.status]);

  useEffect(() => {
    const screenVisible =
      isFocused && mission?.status === "in_progress";
    setActiveMiniMissionNotificationContext({
      missionId: screenVisible && mission ? mission.id : null,
      screenVisible,
    });
    return () => {
      setActiveMiniMissionNotificationContext({
        missionId: null,
        screenVisible: false,
      });
    };
  }, [isFocused, mission?.id, mission?.status]);

  const flightProgressive = useMemo(
    () => remainingMsToProgressiveCountdown(countdown),
    [countdown],
  );

  const flightTone = useMemo(() => {
    if (!mission) {
      return "muted" as const;
    }
    if (completeSheetOpen) {
      return "countdown" as const;
    }
    if (isTimerUp) {
      return "danger" as const;
    }
    if (mission.status === "completed") {
      return "muted" as const;
    }
    if (mission.status === "cancelled") {
      return "muted" as const;
    }
    if (mission.status === "in_progress") {
      return "countdown" as const;
    }
    return "countdown" as const;
  }, [mission, completeSheetOpen, isTimerUp]);

  const missionFuelProgress = useMemo(() => {
    if (!mission || mission.status !== "in_progress" || !mission.startedAt)
      return 0;
    const totalMs = totalMinutes * 60 * 1000;
    const tick =
      completeSheetOpen && timerFrozenAtMs !== null ? timerFrozenAtMs : now;
    const elapsedMs = tick - new Date(mission.startedAt).getTime();
    return Math.min(1, Math.max(0, elapsedMs / totalMs));
  }, [mission, now, totalMinutes, completeSheetOpen, timerFrozenAtMs]);

  // Timer expiry while this screen is open: haptics + cancel OS schedule (avoid duplicate).
  // Dedupe by mission id + planned end (module map) so leaving and reopening the card does not spam.
  useEffect(() => {
    if (!isTimerUp || !mission?.startedAt) return;
    const endMs = getPlannedEndMs(mission);
    if (foregroundExpiryNotifiedEndMsByMissionId.get(mission.id) === endMs)
      return;
    foregroundExpiryNotifiedEndMsByMissionId.set(mission.id, endMs);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Vibration.vibrate([0, 400, 200, 400, 200, 400]);
    void (async () => {
      await clearMiniMissionNotifications(mission.id);
    })();
  }, [isTimerUp, mission]);

  const earlyFinishMs = useMemo(() => {
    if (!mission || mission.status !== "completed") return 0;
    if (!mission.startedAt || !mission.completedAt) return 0;
    const plannedMs = totalMinutes * 60 * 1000;
    const actualMs =
      new Date(mission.completedAt).getTime() -
      new Date(mission.startedAt).getTime();
    return Math.max(0, plannedMs - actualMs);
  }, [mission, totalMinutes]);

  const confirmDeleteMiniMission = useCallback(() => {
    if (!mission) return;
    setDeleteDialogOpen(false);
    const id = mission.id;
    setPendingExitAfterRemove(true);
    void (async () => {
      await deleteCommunityWin(id);
      deleteMiniMission(id);
      router.replace("/mini");
    })();
  }, [mission, router, deleteMiniMission]);

  useCoachMark(
    "mini_start_timer",
    {
      title: "Start the timer",
      body: "Begin when you can stay with this task until it is done.",
      placement: "above",
    },
    Boolean(
      mission &&
        mission.status !== "in_progress" &&
        mission.status !== "completed" &&
        mission.status !== "cancelled",
    ),
    700,
  );
  useCoachMark(
    "mini_mark_complete",
    {
      title: "Finish before zero",
      body: "Mark complete while the timer is still alive to save the win.",
      placement: "above",
    },
    Boolean(mission?.status === "in_progress" && !isTimerUp && !completeSheetOpen),
    900,
  );

  if (!mission) {
    return (
      <Screen>
        {pendingExitAfterRemove ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.cyan[400]} />
          </View>
        ) : (
          <View style={styles.centered}>
            <Text style={[styles.notFound, { color: theme.colors.textPrimary }]}>
              Mini mission not found
            </Text>
            <Button title="Go Back" onPress={() => router.back()} />
          </View>
        )}
      </Screen>
    );
  }

  const handleStart = () => {
    if (startPromptBusyRef.current) return;
    startPromptBusyRef.current = true;
    void (async () => {
      try {
        const notificationResult = await softAskNotifications("mini_timer");
        if (notificationResult === "settings") return;

        startMiniMission(mission.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } finally {
        startPromptBusyRef.current = false;
      }
    })();
  };

  const handleMarkComplete = () => {
    setFocusModeOpen(false);
    setTimerFrozenAtMs(Date.now());
    setCompleteSheetOpen(true);
  };

  const handleCompleteCommit = async (
    memory: StreakMemory | null,
    meta?: { publishToCommunity?: boolean },
  ) => {
    let memoryToSave = memory;
    if (
      memory &&
      canUseStreakMemoryUpload() &&
      shouldUploadLocalStreakImage(memory.imageUri)
    ) {
      try {
        const imageUrl = await uploadMiniStreakMemoryImage({
          miniMissionId: mission.id,
          localUri: memory.imageUri!,
        });
        memoryToSave = { ...memory, imageUrl, imageUri: undefined };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert("Photo upload failed", msg, [{ text: "OK" }]);
        throw e;
      }
    }

    const completedAt = new Date(timerFrozenAtMs ?? Date.now()).toISOString();
    const wantsPublish = meta?.publishToCommunity === true;
    const publishCloudReady = wantsPublish && isSupabaseConfigured() && session?.user != null;
    const freshPremium = publishCloudReady
      ? await refreshPremiumAccess({ force: true })
      : null;
    let canPublish = publishCloudReady && freshPremium === true;
    if (publishCloudReady && freshPremium !== true) {
      openUpsell("community_publish");
    }
    if (canPublish) {
      const hasImage = Boolean(memoryToSave?.imageUrl || memoryToSave?.imageUri);
      if (!hasImage) {
        Alert.alert(
          "Photo required",
          "Community posts need a photo. Add a photo and tap Complete with Memory again.",
          [{ text: "OK" }],
        );
        canPublish = false;
      }
    }

    if (wantsPublish && !isSupabaseConfigured()) {
      Alert.alert(
        "Can’t publish",
        "Cloud sync isn’t configured. Your mission is saved as private.",
        [{ text: "OK" }],
      );
    } else if (wantsPublish && !session?.user) {
      Alert.alert(
        "Sign in to publish",
        "Sign in to share this win in Community. Your mission is saved as private.",
        [{ text: "OK" }],
      );
    }

    /** Solo at completion (or can’t publish) locks Community; successful publish sets public afterward. */
    const lockCommunity = !canPublish;

    completeMiniMission(mission.id, memoryToSave, {
      visibility: "solo",
      communityFeedRevoked: lockCommunity,
      completedAt,
    });

    if (canPublish) {
      const ok = await requireUsername("community_post");
      if (!ok) {
        Alert.alert("Username required", "Choose a username to publish to Community.", [{ text: "OK" }]);
        return;
      }
      const res = await postCommunityWin({
        miniMissionId: mission.id,
        title: mission.title,
        completedAt,
        memoryNote: memoryToSave?.note ?? null,
        memoryImageUrl: memoryToSave?.imageUrl ?? null,
      });
      if (res.ok === true) {
        setMiniMissionVisibility(mission.id, "public");
        setMiniMissionCommunityFeedRevoked(mission.id, false);
      } else {
        Alert.alert("Couldn’t publish", res.error, [{ text: "OK" }]);
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleVisibilityChange = (next: MissionVisibility) => {
    if (!mission) return;
    const prev = mission.visibility ?? "solo";
    if (prev === next) return;

    if (prev === "public" && next === "solo") {
      Alert.alert(
        "Remove from Community?",
        "This removes your win from the feed. You won’t be able to publish this mission to Community again.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              void (async () => {
                const del = await deleteCommunityWin(mission.id);
                if (del.ok === false) {
                  Alert.alert("Couldn’t remove", del.error, [{ text: "OK" }]);
                  return;
                }
                setMiniMissionVisibility(mission.id, "solo");
                setMiniMissionCommunityFeedRevoked(mission.id, true);
              })();
            },
          },
        ],
      );
      return;
    }

    if (prev === "solo" && next === "public") {
      if (mission.communityFeedRevoked) {
        Alert.alert(
          "Can’t publish to Community",
          "This mission stays private. Community sharing was turned off when you completed it, or you removed it from the feed.",
          [{ text: "OK" }],
        );
        return;
      }
      if (!isSupabaseConfigured() || !session?.user) {
        Alert.alert(
          "Sign in required",
          "Sign in to publish to Community wins.",
          [{ text: "OK" }],
        );
        return;
      }
      const completionMem = mission.completionMemory;
      const hasCompletionPhoto = Boolean(completionMem?.imageUrl || completionMem?.imageUri);
      if (!hasCompletionPhoto) {
        Alert.alert(
          "Photo required",
          "Community posts need a photo. Add one to your completion memory first.",
          [{ text: "OK" }],
        );
        return;
      }
      void (async () => {
        const freshPremium = await refreshPremiumAccess({ force: true });
        if (freshPremium !== true) {
          openUpsell("community_publish");
          return;
        }
        lastVisibilityRef.current = { id: mission.id, prev };
        const ok = await requireUsername("community_post");
        if (!ok) {
          Alert.alert("Username required", "Choose a username to publish to Community.", [{ text: "OK" }]);
          lastVisibilityRef.current = null;
          return;
        }
        const res = await postCommunityWin({
          miniMissionId: mission.id,
          title: mission.title,
          completedAt: mission.completedAt ?? new Date().toISOString(),
          memoryNote: mission.completionMemory?.note ?? null,
          memoryImageUrl: mission.completionMemory?.imageUrl ?? null,
        });
        if (res.ok === false) {
          Alert.alert("Couldn’t publish", res.error, [{ text: "OK" }]);
          lastVisibilityRef.current = null;
          return;
        }
        setMiniMissionVisibility(mission.id, "public");
        lastVisibilityRef.current = null;
      })();
    }
  };

  const reserveUsed = mission.extendedMinutes ?? 0;
  const reserveFull = reserveUsed >= MAX_RESERVE_FUEL_MINUTES;
  const reserveSlotsAvailable = (() => {
    if (mission.status !== "in_progress" || !mission.startedAt) return 0;
    const elapsedMs = Math.max(0, now - new Date(mission.startedAt).getTime());
    const earnedSlots = Math.min(
      MAX_RESERVE_FUEL_MINUTES,
      Math.floor(elapsedMs / 60_000),
    );
    return Math.max(0, earnedSlots - reserveUsed);
  })();
  const reserveCanAdd =
    reserveSlotsAvailable > 0 && !reserveFull && !isTimerUp;

  const handleReserveFuel = () => {
    if (reserveFull) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "Reserve fuel maxed",
        `You can add at most ${MAX_RESERVE_FUEL_MINUTES} minutes of reserve fuel for this mission. Mark complete or risk running out of time.`,
      );
      return;
    }
    if (!reserveCanAdd) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    extendMiniMission(mission.id, 1);
    void syncMiniMissionNotifications(useHabitStore.getState().miniMissions);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleCancel = () => {
    cancelMiniMission(mission.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const handleRetryFailed = () => {
    retryFailedMiniMission(mission.id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <Screen>
      <ConfirmDialog
        visible={deleteDialogOpen}
        onRequestClose={() => setDeleteDialogOpen(false)}
        title="Delete Mini Mission"
        message="Delete this mini mission permanently?"
        actions={[
          { label: "Cancel", variant: "secondary", onPress: () => setDeleteDialogOpen(false) },
          { label: "Delete", variant: "danger", onPress: confirmDeleteMiniMission },
        ]}
      />
      <MissionDetailsSheet
        variant="mini"
        visible={missionDetailsOpen}
        onClose={() => setMissionDetailsOpen(false)}
        mission={mission}
      />
      <StreakMemorySheet
        visible={completeSheetOpen}
        variant="mini"
        mode="create"
        missionTitle={mission.title}
        dayLabel="1"
        onClose={() => {
          setCompleteSheetOpen(false);
          setTimerFrozenAtMs(null);
        }}
        onCommit={handleCompleteCommit}
        miniPublishAvailable={isSupabaseConfigured() && !!session?.user}
        plusCommunityOk={!socialLocked}
      />
      <FocusMissionControlModal
        visible={focusModeOpen}
        title={mission.title}
        countdownMs={countdown}
        totalMinutes={totalMinutes}
        baseMissionSeconds={Math.max(1, mission.estimatedMinutes * 60)}
        reserveSlotsAvailable={reserveSlotsAvailable}
        reserveUsed={reserveUsed}
        reserveFull={reserveFull}
        isTimerUp={isTimerUp}
        onClose={() => setFocusModeOpen(false)}
        onReserveFuel={handleReserveFuel}
        onMarkComplete={handleMarkComplete}
      />
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.background}
      />
      <View style={styles.header}>
        <TouchableOpacity
          style={[
            styles.iconButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={() => router.back()}
        >
          <ArrowLeft size={theme.icon.lg} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.iconButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={() => setDeleteDialogOpen(true)}
        >
          <Trash2 size={theme.icon.md} color={theme.colors.red[500]} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: scrollBottomPad }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.title,
              {
                color: theme.colors.textPrimary,
                fontSize: theme.typography.h1,
                lineHeight: Math.round(theme.typography.h1 * 1.12),
              },
            ]}
            numberOfLines={2}
          >
            {mission.title}
          </Text>
          <TouchableOpacity
            style={styles.infoButton}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMissionDetailsOpen(true);
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Mini mission details"
          >
            <Info size={theme.icon.md} color={theme.colors.indigo[400]} />
          </TouchableOpacity>
        </View>

        {mission.status === "in_progress" && !isTimerUp ? (
          <MiniMissionFlightCountdown
            display={flightProgressive.display}
            phase={flightProgressive.phase}
            tone={flightTone}
          />
        ) : null}
        <View style={styles.topPillsRow}>
          {mission.status === "completed" ? (
            <View
              style={[
                styles.completedPill,
                {
                  backgroundColor: isDark ? "rgba(34, 197, 94, 0.14)" : "rgba(22, 163, 74, 0.12)",
                  borderColor: isDark ? "rgba(34, 197, 94, 0.28)" : "rgba(22, 163, 74, 0.22)",
                },
              ]}
            >
              <Check size={16} color={theme.colors.green[500]} />
              <Text style={[styles.completedPillText, { color: theme.colors.green[500] }]}>
                Completed
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.metaPill,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceElevated,
              },
            ]}
          >
            <Clock3 size={14} color={theme.colors.cyan[400]} />
            <Text style={[styles.metaText, { color: theme.colors.textPrimary }]}>
              {mission.status === "in_progress" && !isTimerUp
                ? `${totalMinutes} min total · reserve ${reserveUsed}/${MAX_RESERVE_FUEL_MINUTES} min`
                : `${totalMinutes} minutes ${
                    (mission.extendedMinutes ?? 0) > 0
                      ? `(+${mission.extendedMinutes ?? 0} reserve)`
                      : "planned"
                  }`}
            </Text>
          </View>
        </View>

        {mission.status !== "completed" ? (
          <Text style={[styles.timerHint, { color: theme.colors.textSecondary }]}>
            {isTimerUp
              ? "Timer depleted. No reserve fuel after zero. Cancel this mission or go back."
              : mission.status === "in_progress"
                ? completeSheetOpen
                  ? "Timer paused while you save your moment."
                  : `Stay with it until done. Reserve fuel is capped at ${MAX_RESERVE_FUEL_MINUTES} min total.`
                : "Ready when you are."}
          </Text>
        ) : null}

        {mission.status === "in_progress" && (
          <View style={styles.progressBarWrap}>
            <MiniMissionFireProgressBar
              progress={isTimerUp ? 1 : missionFuelProgress}
              isDark={isDark}
              showCompleteEffect={isTimerUp}
            />
          </View>
        )}

        {mission.status === "in_progress" && !isTimerUp ? (
          <TouchableOpacity
            style={[
              styles.focusLauncher,
              {
                borderRadius: theme.radius.md,
                borderColor: isDark
                  ? "rgba(34, 211, 238, 0.35)"
                  : "rgba(8, 145, 178, 0.28)",
                backgroundColor: isDark
                  ? "rgba(34, 211, 238, 0.1)"
                  : "rgba(8, 145, 178, 0.08)",
              },
            ]}
            activeOpacity={0.86}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFocusModeOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Open focus mode"
          >
            <Maximize2 size={18} color={theme.colors.cyan[400]} />
            <Text style={[styles.focusLauncherText, { color: theme.colors.textPrimary }]}>
              Focus Mode
            </Text>
          </TouchableOpacity>
        ) : null}

        {mission.status === "completed" ? (
          <MiniVisibilityRow
            theme={theme}
            visibility={mission.visibility ?? "solo"}
            onChange={handleVisibilityChange}
            showToggle={
              !(
                (mission.visibility ?? "solo") === "solo" &&
                mission.communityFeedRevoked
              )
            }
          />
        ) : null}

        <View style={styles.actions}>
          {mission.status !== "in_progress" &&
            mission.status !== "completed" &&
            mission.status !== "cancelled" && (
              <CoachMarkTarget id="mini_start_timer">
                <Button title="Start Now" onPress={handleStart} />
              </CoachMarkTarget>
            )}

          {mission.status === "in_progress" && !isTimerUp && (
            <>
              <CoachMarkTarget id="mini_mark_complete">
                <Button
                  title="Mark Complete"
                  onPress={handleMarkComplete}
                />
              </CoachMarkTarget>
              {reserveFull || !reserveCanAdd ? (
                <View
                  style={[
                    styles.extendButton,
                    styles.extendButtonDisabled,
                    { borderRadius: theme.radius.md },
                  ]}
                >
                  <Fuel size={20} color={theme.colors.textMuted} />
                  <Text
                    style={[styles.extendButtonText, { color: theme.colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {reserveFull
                      ? `Reserve fuel max (${MAX_RESERVE_FUEL_MINUTES} min)`
                      : `Reserve slot opens each minute - ${reserveUsed}/${MAX_RESERVE_FUEL_MINUTES}`}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.extendButton, { borderRadius: theme.radius.md }]}
                  onPress={handleReserveFuel}
                  activeOpacity={0.85}
                >
                  <Fuel size={20} color={theme.colors.amber[500]} />
                  <Text
                    style={[
                      styles.extendButtonText,
                      { color: theme.colors.amber[500] },
                    ]}
                    numberOfLines={1}
                  >
                    Need reserve fuel · +1 min · {reserveUsed}/{MAX_RESERVE_FUEL_MINUTES}
                  </Text>
                </TouchableOpacity>
              )}
              <Button
                title="Cancel Mission"
                variant="secondary"
                onPress={handleCancel}
              />
            </>
          )}

          {isTimerUp && (
            <>
              <View style={styles.failedRow}>
                <CircleX size={22} color={theme.colors.red[500]} />
                <View style={styles.failedTextCol}>
                  <Text
                    style={[
                      styles.failedTitle,
                      { color: theme.colors.red[500] },
                    ]}
                  >
                    Mission failed
                  </Text>
                  <Text
                    style={[
                      styles.failedHint,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    The timer hit zero before you marked complete.
                  </Text>
                </View>
              </View>
              <Button title="Retry mission" onPress={handleRetryFailed} />
            </>
          )}

          {mission.status === "completed" && (
            <>
              {/* Achievement stats */}
              <View style={styles.completedRow}>
                <Check size={18} color={theme.colors.green[500]} />
                <Text style={[styles.completedText, { color: theme.colors.green[500] }]}>
                  Mini mission completed
                </Text>
              </View>

              {earlyFinishMs > 0 && (
                <View style={[styles.rewardCard, { borderRadius: theme.radius.md }]}>
                  <View style={styles.rewardHeader}>
                    <Flame size={18} color="#f59e0b" fill="#fde68a" />
                    <Text style={[styles.rewardTitle, { color: theme.colors.yellow[400] }]}>
                      Early Finish Reward
                    </Text>
                  </View>
                  <View style={styles.rewardRow}>
                    <Trophy size={16} color={theme.colors.yellow[400]} />
                    <Text
                      style={[
                        styles.rewardText,
                        { color: isDark ? "#fde68a" : theme.colors.amber[500] },
                      ]}
                    >
                      You beat your estimate by {formatDuration(earlyFinishMs)}.
                    </Text>
                  </View>
                </View>
              )}

              {/* Moment captured */}
              {(mission.completionMemory?.imageUrl ||
                mission.completionMemory?.imageUri ||
                mission.completionMemory?.note) && (
                <View style={styles.completionMomentSection}>
                  <View style={styles.completionMomentHead}>
                    <Sparkles size={16} color={theme.colors.amber[500]} />
                    <Text style={[styles.completionMomentTitle, { color: theme.colors.textPrimary }]}>
                      Your moment
                    </Text>
                  </View>
                  {completionImageUri ? (
                    <Pressable
                      onPress={() => setCompletionImageOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel="View moment photo"
                      style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
                    >
                      <View
                        style={[
                          styles.completionImageWrap,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor: theme.colors.surfaceElevated,
                          },
                          completionImageAspect != null ? { aspectRatio: completionImageAspect } : null,
                        ]}
                      >
                        <Image
                          source={{ uri: completionImageUri }}
                          style={styles.completionImage}
                          resizeMode="cover"
                          onLoad={(e) => {
                            const w = e.nativeEvent.source?.width;
                            const h = e.nativeEvent.source?.height;
                            if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
                              setCompletionImageAspect(w / h);
                            }
                          }}
                        />
                      </View>
                    </Pressable>
                  ) : null}
                  {mission.completionMemory?.note ? (
                    <View
                      style={[
                        styles.completionNoteBox,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surface,
                        },
                      ]}
                    >
                      <Text style={[styles.completionNoteText, { color: theme.colors.textPrimary }]}>
                        {mission.completionMemory.note}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </>
          )}

          {mission.status === "cancelled" && (
            <View style={styles.cancelledRow}>
              <CircleX size={18} color={theme.colors.red[500]} />
              <Text
                style={[styles.cancelledText, { color: theme.colors.red[500] }]}
              >
                This mini mission is cancelled
              </Text>
            </View>
          )}
        </View>

        {/* Motivational quotes — glass card at the bottom, only while timer is running */}
        {mission.status === "in_progress" && !isTimerUp && !completeSheetOpen && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => animateQuoteChange((quoteIdx + 1) % QUOTES.length)}
            style={[
              quoteStyles.glassCard,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(255,255,255,0.5)",
                borderColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)",
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <Animated.View
              style={[quoteStyles.textWrap, { opacity: quoteFade }]}
            >
              <Text
                style={[
                  quoteStyles.quoteText,
                  {
                    color: isDark
                      ? "rgba(255,255,255,0.7)"
                      : "rgba(0,0,0,0.55)",
                  },
                ]}
              >
                “{QUOTES[quoteIdx].text}”
              </Text>
              <Text
                style={[
                  quoteStyles.quoteAuthor,
                  {
                    color: isDark
                      ? "rgba(255,255,255,0.35)"
                      : "rgba(0,0,0,0.35)",
                  },
                ]}
              >
                {" · "}
                {QUOTES[quoteIdx].author}
              </Text>
            </Animated.View>
            {/* Pagination dots */}
            <View style={quoteStyles.dotsRow}>
              {[0, 1, 2].map((dotIdx) => (
                <View
                  key={dotIdx}
                  style={[
                    quoteStyles.dot,
                    {
                      backgroundColor:
                        quoteIdx % 3 === dotIdx
                          ? isDark
                            ? "rgba(255,255,255,0.5)"
                            : "rgba(0,0,0,0.35)"
                          : isDark
                            ? "rgba(255,255,255,0.12)"
                            : "rgba(0,0,0,0.1)",
                    },
                  ]}
                />
              ))}
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>

      {completionImageUri ? (
        <Modal
          visible={completionImageOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setCompletionImageOpen(false)}
        >
          <Pressable style={styles.viewerBackdrop} onPress={() => setCompletionImageOpen(false)}>
            <Pressable style={styles.viewerInner} onPress={(e) => e.stopPropagation()}>
              <Image source={{ uri: completionImageUri }} style={styles.viewerImg} resizeMode="contain" />
              <Pressable
                onPress={() => setCompletionImageOpen(false)}
                style={[styles.viewerClose, { backgroundColor: theme.colors.surface }]}
                accessibilityRole="button"
                accessibilityLabel="Close photo"
              >
                <CircleX size={22} color={theme.colors.textPrimary} />
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { marginBottom: 12 },
  scroll: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: 8,
    marginBottom: 12,
  },
  title: { flexShrink: 1, fontWeight: "800" },
  infoButton: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    transform: [{ translateY: 3 }],
  },
  timerHint: { textAlign: "center", marginTop: 4, marginBottom: 4, paddingHorizontal: 4 },
  topPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 12,
    marginBottom: 10,
  },
  completedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 9999,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  completedPillText: { fontWeight: "800", fontSize: 13, letterSpacing: 0.2 },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 9999,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  metaText: { fontWeight: "700" },
  actions: { gap: 10 },
  progressBarWrap: { marginBottom: 14 },
  focusLauncher: {
    marginBottom: 18,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  focusLauncherText: {
    fontSize: 15,
    fontWeight: "800",
  },
  failedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  failedTextCol: { flex: 1 },
  failedTitle: { fontWeight: "800", fontSize: 16, marginBottom: 4 },
  failedHint: { fontSize: 13, lineHeight: 18 },
  extendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  extendButtonText: { fontWeight: "700", fontSize: 15, flexShrink: 1 },
  extendButtonDisabled: { opacity: 0.72, backgroundColor: "rgba(148, 163, 184, 0.12)", borderColor: "rgba(148, 163, 184, 0.35)" },
  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  completedText: { fontWeight: "700" },
  completionMomentSection: { marginTop: 4, marginBottom: 4, gap: 10 },
  completionMomentHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  completionMomentTitle: { fontWeight: "800", fontSize: 14 },
  completionImageWrap: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    width: "92%",
    alignSelf: "center",
    maxWidth: 380,
    maxHeight: 260,
  },
  completionImage: { ...StyleSheet.absoluteFillObject },
  completionNoteBox: { borderRadius: 14, borderWidth: 1, padding: 14 },
  completionNoteText: { fontSize: 15, lineHeight: 22 },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  viewerInner: {
    width: "100%",
    maxWidth: 520,
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImg: { width: "100%", height: 420 },
  viewerClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardCard: {
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.45)",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    padding: 12,
    marginTop: 2,
  },
  rewardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  rewardTitle: { fontWeight: "800", fontSize: 13, letterSpacing: 0.4 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rewardText: { fontWeight: "600" },
  cancelledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  cancelledText: { fontWeight: "700" },
});

const focusStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#020617",
    overflow: "hidden",
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  topCopy: {
    flex: 1,
    minWidth: 0,
  },
  topReserveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.38)",
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topReserveText: {
    color: "#fbbf24",
    fontSize: 16,
    fontWeight: "900",
  },
  focusTitle: {
    color: "#f8fafc",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
  },
  focusTitleWide: {
    fontSize: 24,
    lineHeight: 30,
  },
  completeIconButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34, 197, 94, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.38)",
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.28)",
    backgroundColor: "rgba(15, 23, 42, 0.78)",
  },
  focusScroll: {
    flex: 1,
  },
  body: {
    flexGrow: 1,
    gap: 14,
  },
  bodyWide: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 16,
  },
  timerDeck: {
    borderWidth: 1,
    borderColor: "rgba(34, 211, 238, 0.24)",
    borderRadius: 24,
    backgroundColor: "#061423",
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 10,
    shadowColor: "#22d3ee",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
  timerDeckWide: {
    flex: 1.6,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  deckHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
  },
  timerReadout: {
    alignItems: "stretch",
    justifyContent: "center",
    paddingTop: 4,
    paddingBottom: 0,
    backgroundColor: "#061423",
  },
  statusStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    backgroundColor: "rgba(2, 6, 23, 0.48)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  rail: {
    flex: 1,
    gap: 12,
    minHeight: 0,
  },
  railWide: {
    flex: 1,
  },
  secondsDeck: {
    borderWidth: 1,
    borderColor: "rgba(34, 211, 238, 0.24)",
    borderRadius: 20,
    backgroundColor: "rgba(4, 18, 31, 0.9)",
    padding: 14,
    gap: 14,
  },
  secondsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  secondsTitleCol: {
    flexShrink: 0,
  },
  secondsKicker: {
    color: "rgba(165, 243, 252, 0.78)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  secondsValue: {
    fontSize: 22,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  secondsMeta: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 9,
  },
  secondsMetaItem: {
    alignItems: "center",
    minWidth: 34,
  },
  secondsMetaValue: {
    fontSize: 13,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  secondsMetaLabel: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  secondsMetaDivider: {
    width: 1,
    height: 24,
    opacity: 0.8,
  },
  secondsGrid: {
    alignSelf: "center",
  },
  secondsGridRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  secondCell: {
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    borderRadius: 18,
    backgroundColor: "rgba(15, 23, 42, 0.68)",
    paddingVertical: 13,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(148, 163, 184, 0.18)",
  },
  statValue: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    color: "rgba(148, 163, 184, 0.82)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  focusActions: {
    gap: 10,
  },
  completeButton: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#4f46e5",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 8,
  },
  completeButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryActions: {
    flexDirection: "row",
    gap: 10,
  },
  reserveButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.32)",
    backgroundColor: "rgba(251, 191, 36, 0.1)",
  },
  reserveButtonText: {
    color: "#fbbf24",
    fontSize: 13,
    fontWeight: "900",
  },
  exitButton: {
    minWidth: 92,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    backgroundColor: "rgba(15, 23, 42, 0.72)",
  },
  exitButtonText: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "900",
  },
  actionDisabled: {
    opacity: 0.58,
  },
});

const quoteStyles = StyleSheet.create({
  glassCard: {
    marginTop: 20,
    padding: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  textWrap: { alignItems: "center", paddingHorizontal: 8 },
  quoteText: {
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  quoteAuthor: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 8,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
