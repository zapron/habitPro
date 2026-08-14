import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Text } from "./AppText";
import {
  View,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  InteractionManager,
  Platform,
} from "react-native";
import { useRouter } from 'expo-router';
import { GlassTopHighlight } from './GlassTopHighlight';
import { Check, CircleX, Users, Plane, Gamepad2, Swords, Wrench, Flame } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { withAlpha } from '../styles/theme';
import { Habit } from '../types/habit';
import { needsMainMissionOutcome } from '../utils/mainMissionUi';
import { useHabitStore } from '../store/habitStore';
import { onAppReady } from '../lib/appReadySignal';
import * as Haptics from 'expo-haptics';
import { getEligibleStreakRepair } from "../utils/streakRepairEligibility";
import { calendarDateForHabitMissionDayIndex, getHabitActiveMissionDaySlot } from "../utils/missionDaySlots";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { showAppAlert } from "../context/AppDialogContext";
import Svg, { Circle, G } from "react-native-svg";
import { prewarmChallengeStreaks } from "../lib/groupChallengesApi";
import { fontFamily } from "../styles/fonts";
import type { redesignPalette } from "../styles/redesignPalette";

const prewarmedGroupStreakIds = new Set<string>();
const ANDROID_SEGMENTED_RING_DAY_LIMIT = 45;
/** Streak ring's rendered size. */
const HABIT_RING_SIZE = 56;
/**
 * Extra top margin on the ring whenever its status label renders above it (see
 * `cardStreakTopRight`) — keeps a fixed clearance between the card's own top edge
 * and the label, regardless of how tall `cardContent`'s content ends up being (a
 * plain 0 margin let the label land almost flush against the card's top padding on
 * short cards, since the ring — and the label pinned above it — could get centered
 * very close to the row's own top).
 */
const HABIT_RING_LABEL_GAP = 22;
/** Per-card stagger for the "stack up from below" mount animation — capped so a long list's later cards don't wait forever. */
const CARD_ENTRANCE_STAGGER_MS = 70;
const CARD_ENTRANCE_STAGGER_CAP_MS = 480;
const CARD_ENTRANCE_RISE_PX = 54;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

const RingBoundaryDots = memo(function RingBoundaryDots({
  ringSize,
  strokeWidth,
  totalDays,
  slot,
  habit,
  nowMs,
  doneColor,
  missedColor,
  futureColor,
  pendingColor,
  completedDateSet,
}: {
  ringSize: number;
  strokeWidth: number;
  totalDays: number;
  slot: number | null;
  habit: Habit;
  nowMs: number;
  doneColor: string;
  missedColor: string;
  futureColor: string;
  pendingColor: string;
  completedDateSet: ReadonlySet<string>;
}) {
  const days = Math.max(1, Math.floor(totalDays));
  const current = slot == null ? 0 : clamp(Math.floor(slot), 0, days);

  // Dot size scales down as mission length grows.
  const dotD = clamp((ringSize * 0.58) / (Math.sqrt(days) * 2.35), 0.9, 2.5);
  const radius = ringSize / 2 - strokeWidth / 2;
  const cx = ringSize / 2;
  const cy = ringSize / 2;

  const nodes = [];
  for (let day = 1; day <= days; day++) {
    const theta = ((day - 1) / days) * Math.PI * 2 - Math.PI / 2;
    const x = cx + radius * Math.cos(theta) - dotD / 2;
    const y = cy + radius * Math.sin(theta) - dotD / 2;

    const dateStr = calendarDateForHabitMissionDayIndex(habit, day - 1, nowMs);
    const done = Boolean(dateStr && completedDateSet.has(dateStr));

    let bg = futureColor;
    if (day < current) bg = done ? doneColor : missedColor;
    else if (day === current) bg = done ? doneColor : pendingColor;

    nodes.push(
      <View
        key={day}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: dotD,
          height: dotD,
          borderRadius: 9999,
          backgroundColor: bg,
        }}
      />,
    );
  }

  return <View style={{ position: "absolute", left: 0, top: 0, width: ringSize, height: ringSize }}>{nodes}</View>;
});

/**
 * GitHub-contributions-style badge: one small circle per mission day, filled
 * for completed days, empty for the rest. The day currently open for
 * check-in (if any) blinks red instead, so "you can mark this one" reads at
 * a glance without a separate hint.
 */
const MiniDayGrid = memo(function MiniDayGrid({
  size,
  totalDays,
  habit,
  nowMs,
  completedDateSet,
  doneColor,
  emptyColor,
  activeDateStr,
  activeColor,
  reduceMotion,
  repairDateStr,
  repairColor,
  onRepairPress,
}: {
  size: number;
  totalDays: number;
  habit: Habit;
  nowMs: number;
  completedDateSet: ReadonlySet<string>;
  doneColor: string;
  emptyColor: string;
  activeDateStr?: string | null;
  activeColor?: string;
  reduceMotion?: boolean;
  repairDateStr?: string | null;
  repairColor?: string;
  onRepairPress?: () => void;
}) {
  const days = Math.max(1, Math.floor(totalDays));
  const columns = Math.max(1, Math.ceil(Math.sqrt(days)));
  const rows = Math.max(1, Math.ceil(days / columns));
  const gap = 2;
  const cell = Math.max(3, Math.floor((size - gap * (Math.max(columns, rows) - 1)) / Math.max(columns, rows)));

  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!activeDateStr || reduceMotion) {
      blink.stopAnimation();
      blink.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.2, duration: 500, useNativeDriver: true, isInteraction: false }),
        Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true, isInteraction: false }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      blink.setValue(1);
    };
  }, [activeDateStr, reduceMotion, blink]);

  const cells = [];
  for (let day = 0; day < days; day++) {
    const dateStr = calendarDateForHabitMissionDayIndex(habit, day, nowMs);
    const done = Boolean(dateStr && completedDateSet.has(dateStr));
    const isActive = Boolean(activeDateStr && dateStr === activeDateStr);
    const isRepair = Boolean(repairDateStr && dateStr === repairDateStr);
    cells.push(
      isRepair ? (
        <TouchableOpacity
          key={day}
          onPress={onRepairPress}
          hitSlop={6}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Repair streak"
          style={{ width: cell, height: cell, alignItems: "center", justifyContent: "center" }}
        >
          <Wrench size={Math.max(cell, 6)} color={repairColor} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : isActive ? (
        <Animated.View
          key={day}
          style={{
            width: cell,
            height: cell,
            borderRadius: cell / 2,
            backgroundColor: activeColor,
            opacity: blink,
          }}
        />
      ) : (
        <View
          key={day}
          style={{
            width: cell,
            height: cell,
            borderRadius: cell / 2,
            backgroundColor: done ? doneColor : emptyColor,
          }}
        />
      ),
    );
  }

  return (
    <View
      style={{
        width: columns * cell + gap * (columns - 1),
        flexDirection: "row",
        flexWrap: "wrap",
        gap,
      }}
    >
      {cells}
    </View>
  );
});

const RingDayArcs = memo(function RingDayArcs({
  ringSize,
  strokeWidth,
  totalDays,
  slot,
  habit,
  nowMs,
  doneColor,
  missedColor,
  futureColor,
  pendingColor,
  completedDateSet,
}: {
  ringSize: number;
  strokeWidth: number;
  totalDays: number;
  slot: number | null;
  habit: Habit;
  nowMs: number;
  doneColor: string;
  missedColor: string;
  futureColor: string;
  pendingColor: string;
  completedDateSet: ReadonlySet<string>;
}) {
  const days = Math.max(1, Math.floor(totalDays));
  const current = slot == null ? 0 : clamp(Math.floor(slot), 0, days);

  const cx = ringSize / 2;
  const cy = ringSize / 2;
  const r = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  // Small visual gap between day segments.
  const gap = clamp(circumference / (days * 14), 0.6, 1.6);
  const seg = circumference / days;
  const segLen = Math.max(0.8, seg - gap);

  const arcs = [];
  for (let day = 1; day <= days; day++) {
    const dateStr = calendarDateForHabitMissionDayIndex(habit, day - 1, nowMs);
    const done = Boolean(dateStr && completedDateSet.has(dateStr));

    let color = futureColor;
    if (day < current) color = done ? doneColor : missedColor;
    else if (day === current) color = done ? doneColor : pendingColor;

    arcs.push(
      <Circle
        key={day}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
        strokeDasharray={`${segLen} ${circumference - segLen}`}
        strokeDashoffset={-(day - 1) * seg}
      />,
    );
  }

  return (
    <Svg width={ringSize} height={ringSize} style={{ position: "absolute", left: 0, top: 0 }}>
      <G transform={`rotate(-90 ${cx} ${cy})`}>{arcs}</G>
    </Svg>
  );
});

const LightweightMissionRing = memo(function LightweightMissionRing({
  ringSize,
  strokeWidth,
  progress,
  doneColor,
  futureColor,
}: {
  ringSize: number;
  strokeWidth: number;
  progress: number;
  doneColor: string;
  futureColor: string;
}) {
  const cx = ringSize / 2;
  const cy = ringSize / 2;
  const r = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = clamp(progress, 0, 1);
  const dashOffset = circumference * (1 - clamped);

  return (
    <Svg width={ringSize} height={ringSize} style={{ position: "absolute", left: 0, top: 0 }}>
      <G transform={`rotate(-90 ${cx} ${cy})`}>
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={futureColor}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={doneColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
        />
      </G>
    </Svg>
  );
});

// NOTE: Lottie tinting is not reliable across assets (many are not recolorable at runtime).
// For a true bluish flame, we use the app's AnimatedFire with a cyan color.

interface HabitCardProps {
    item: Habit;
    nowMs: number;
    /** Position in the currently rendered list — drives this card's entrance stagger delay when it first mounts (capped for long lists). */
    index: number;
    /**
     * "habitPro light mode redesign" palette (Claude Design mockup) — passed
     * only by Home while previewing that direction (light + dark variants;
     * this card picks the one matching its own theme). Leave unset for the
     * normal themed card.
     */
    redesignPalette?: typeof redesignPalette | null;
}

export const HabitCard = memo(({ item, nowMs, index, redesignPalette }: HabitCardProps) => {
    const router = useRouter();
    const { theme, isDark } = useTheme();
    const reduceMotion = useReducedMotion();
    const rp = redesignPalette ? (isDark ? redesignPalette.dark : redesignPalette.light) : null;
    const totalDays = Math.max(1, item.totalDays ?? 21);
    const needsReport = useMemo(() => needsMainMissionOutcome(item, nowMs), [item, nowMs]);
    const missionWon = item.missionReport === 'accomplished';
    const missionFailed = item.missionReport === 'failed';
    const failedOutcomeColor = isDark ? "#fca5a5" : "#fb7185";
    const isManual = (item.mode ?? 'autopilot') === 'manual';
    const contextTags = [
        { label: isManual ? "Manual" : "Auto", icon: isManual ? Gamepad2 : Plane },
        item.challengeGroupId ? { label: "Squad", icon: Swords } : null,
    ].filter((tag): tag is { label: string; icon: typeof Plane } => Boolean(tag));
    const completedDateSet = useMemo(() => new Set(item.completedDates), [item.completedDates]);
    /** Mission completion: distinct days checked / campaign length */
    const campaignProgress = Math.min(item.completedDates.length / totalDays, 1);
    /** Current consecutive streak as a share of the mission (ring + center number) */
    const streakProgress = Math.min(item.streak / totalDays, 1);
    const repair = useMemo(() => getEligibleStreakRepair(item, nowMs), [item, nowMs]);

    /** Today's date key while a check-in is open for this mission; null when locked/already done. */
    const activeCheckinDateStr = useMemo(() => {
      if (missionWon || needsReport) return null;
      if (item.status !== "active" || item.isCompleted) return null;
      if (isManual && item.endDate && nowMs >= new Date(item.endDate).getTime()) return null;
      const slot = getHabitActiveMissionDaySlot(item, nowMs);
      if (slot == null) return null;
      const dateStr = calendarDateForHabitMissionDayIndex(item, slot - 1, nowMs);
      if (!dateStr) return null;
      return completedDateSet.has(dateStr) ? null : dateStr;
    }, [missionWon, needsReport, item, nowMs, totalDays, isManual, completedDateSet]);
    const streakCheckinAvailable = activeCheckinDateStr !== null;
    const isChecklistMission = Boolean(item.taskChecklist && item.taskChecklist.length > 0);
    const markChecklistDayComplete = useHabitStore((state) => state.markChecklistDayComplete);
    const showQuickMarkComplete =
      isChecklistMission && streakCheckinAvailable && !missionWon && !missionFailed;
    /** Tasks logged so far for today's not-yet-completed checklist day — same gate as the quick Mark Complete action. */
    const totalChecklistTasks = item.taskChecklist?.length ?? 0;
    const loggedChecklistTasks =
      showQuickMarkComplete && activeCheckinDateStr
        ? (item.streakMemories?.[activeCheckinDateStr]?.tasks?.length ?? 0)
        : 0;
    /** Fits the ring's tiny center micro-label — replaces "STREAK" there when a checklist day is in progress, instead of a separate pill taking up its own row above the title. */
    const ringMicroLabel = showQuickMarkComplete
      ? loggedChecklistTasks >= totalChecklistTasks
        ? "DONE"
        : `${loggedChecklistTasks}/${totalChecklistTasks} TASKS`
      : "STREAK";

    const handleQuickMarkComplete = (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      if (!activeCheckinDateStr) return;
      const dateStr = activeCheckinDateStr;

      const commit = () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const changed = markChecklistDayComplete(item.id, dateStr);
        if (changed) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      };

      // Quick Complete skips the checklist sheet entirely, so a user who hasn't
      // logged (all of) today's tasks yet may not realize this button won't log
      // them for them — confirm first, with copy that reflects what's actually
      // still pending, instead of silently completing the day out from under them.
      const remaining = Math.max(0, totalChecklistTasks - loggedChecklistTasks);
      if (remaining <= 0) {
        commit();
        return;
      }

      const message =
        loggedChecklistTasks === 0
          ? "You haven't logged any tasks today. This will simply mark the day as complete. Do you want to continue, or log some tasks first?"
          : `You still haven't logged ${remaining} task${remaining === 1 ? "" : "s"} today. This will mark the day complete without ${remaining === 1 ? "that task" : "those tasks"} counted. Do you want to continue?`;

      showAppAlert("Mark day complete?", message, [
        {
          text: "I'll log my tasks",
          style: "default",
          onPress: () => router.push(`/habit/${item.id}`),
        },
        { text: "Yes, mark complete", style: "cancel", onPress: commit },
      ]);
    };

    const pulse = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      if (!streakCheckinAvailable || reduceMotion) {
        pulse.stopAnimation();
        pulse.setValue(0);
        return;
      }
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
      );
      loop.start();
      return () => {
        loop.stop();
        pulse.setValue(0);
      };
    }, [streakCheckinAvailable, reduceMotion, pulse]);

    useEffect(() => {
      const challengeId = item.challengeGroupId;
      if (!challengeId || prewarmedGroupStreakIds.has(challengeId)) return undefined;
      prewarmedGroupStreakIds.add(challengeId);
      let started = false;
      const task = InteractionManager.runAfterInteractions(() => {
        started = true;
        void prewarmChallengeStreaks(challengeId).catch((error) => {
          prewarmedGroupStreakIds.delete(challengeId);
          if (__DEV__) console.warn("[habitCard] prewarmChallengeStreaks", error);
        });
      });
      return () => {
        if (!started) prewarmedGroupStreakIds.delete(challengeId);
        task.cancel?.();
      };
    }, [item.challengeGroupId]);

    // "Ping" ripple behind the solid status dot — reads as a live indicator
    // rather than the plain pulsing square this replaced (which looked like a
    // stray, unstyled checkbox at rest).
    const pulseHaloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.8] });
    const pulseHaloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

    // "Stack up from below" mount animation — fires once when this card first
    // appears (initial list load, a tab switch that remounts the list, or a
    // FlashList row rendering a not-yet-seen item while scrolling). Deliberately
    // an empty dep array: this must NOT replay on every re-render (nowMs ticks
    // every second) or on prop changes, only on mount.
    //
    // On the very first app launch, SplashGate mounts the whole app (this card
    // included) *underneath* its splash overlay well before that overlay
    // actually dismisses — so starting the spring immediately on mount meant it
    // ran to completion invisibly behind the splash, and the user only ever saw
    // it play on a later remount (switching tabs and back). `onAppReady` fires
    // right when the splash has actually faded out on first launch, and fires
    // immediately (synchronously) on every mount after that — same feel as
    // before everywhere except the one place it was silently being wasted.
    const entrance = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
    useEffect(() => {
      if (reduceMotion) {
        entrance.setValue(1);
        return undefined;
      }
      let anim: Animated.CompositeAnimation | null = null;
      const unsubscribe = onAppReady(() => {
        const delay = Math.min(index * CARD_ENTRANCE_STAGGER_MS, CARD_ENTRANCE_STAGGER_CAP_MS);
        anim = Animated.spring(entrance, {
          toValue: 1,
          delay,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
          isInteraction: false,
        });
        anim.start();
      });
      return () => {
        unsubscribe();
        anim?.stop();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const entranceStyle = reduceMotion
      ? null
      : {
          opacity: entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' as const }),
          transform: [
            {
              // No clamp here — the spring's natural overshoot past 1 is what
              // gives the "punched up by force" feel (a brief rise above rest
              // before settling back), not just a plain ease-in.
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [CARD_ENTRANCE_RISE_PX, 0],
              }),
            },
          ],
        };

    const openHabit = () => {
        router.push(`/habit/${item.id}`);
        setTimeout(() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }, 0);
    };

    // A Pressable's onPress still fires on release even after onLongPress has
    // already fired — this flag suppresses that so a long-press-to-complete
    // doesn't also immediately navigate into the habit afterward.
    const longPressFiredRef = useRef(false);
    const handleCardLongPress = () => {
        if (!showQuickMarkComplete) return;
        longPressFiredRef.current = true;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        handleQuickMarkComplete({ stopPropagation: () => {} });
    };

    return (
        <Animated.View style={entranceStyle}>
        <Pressable
            onPressIn={() => { longPressFiredRef.current = false; }}
            onPress={() => {
                if (longPressFiredRef.current) return;
                openHabit();
            }}
            onLongPress={showQuickMarkComplete ? handleCardLongPress : undefined}
            delayLongPress={500}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
            style={[
                styles.card,
                {
                    backgroundColor: rp ? rp.screenBg : theme.colors.surface,
                    borderRadius: theme.radius.lg,
                    borderColor: rp ? rp.border : isDark ? theme.colors.border : "transparent",
                    ...(rp ? null : theme.shadow.card),
                },
            ]}
        >
            {rp ? null : <GlassTopHighlight radius={theme.radius.lg} />}
            <View style={styles.cardContent}>
                    <View style={styles.pillRow}>
                            {contextTags.map(({ label, icon: TagIcon }) => (
                                <View
                                    key={label}
                                    style={[
                                        styles.contextPill,
                                        {
                                            backgroundColor: rp
                                                ? rp.chipBg
                                                : withAlpha(theme.colors.textSecondary, isDark ? 8 : 10),
                                            borderColor: rp
                                                ? rp.border
                                                : withAlpha(theme.colors.textSecondary, isDark ? 18 : 24),
                                        },
                                    ]}
                                >
                                    <TagIcon size={8} color={rp ? rp.textMuted : theme.colors.textMuted} strokeWidth={2} />
                                    <Text
                                        style={[
                                            styles.contextPillText,
                                            { color: rp ? rp.textMuted : theme.colors.textMuted },
                                            rp ? { fontFamily: fontFamily.dmSansMedium } : null,
                                        ]}
                                    >
                                        {label}
                                    </Text>
                                </View>
                            ))}
                            {item.streak > 0 ? (
                                <View style={styles.streakInline}>
                                    <Flame size={8} color={rp ? rp.textMuted : theme.colors.textMuted} strokeWidth={2} />
                                    <Text style={[styles.streakInlineText, { color: rp ? rp.textMuted : theme.colors.textMuted }]}>
                                        {item.streak}d
                                    </Text>
                                </View>
                            ) : null}
                            {needsReport && (
                                <Text style={[styles.reportPillText, { color: theme.colors.amber[500] }]}>REVIEW DUE</Text>
                            )}
                    </View>

                    <Text
                        style={[
                            styles.cardTitle,
                            {
                                color: rp ? rp.textPrimary : theme.colors.textPrimary,
                                fontSize: theme.typography.h3,
                                ...(rp ? { fontFamily: fontFamily.manropeBold } : null),
                            },
                        ]}
                    >
                        {item.title}
                    </Text>

                    {item.challengeGroupId || showQuickMarkComplete ? (
                      <View style={styles.cardButtons}>
                        {item.challengeGroupId ? (
                          <TouchableOpacity
                            style={[
                              styles.cardButton,
                              {
                                borderColor: rp ? rp.border : theme.colors.border,
                                backgroundColor: rp ? rp.chipBg : theme.colors.surfaceElevated,
                              },
                            ]}
                            onPress={(event) => {
                              event.stopPropagation();
                              router.push(`/challenge/${item.challengeGroupId}`);
                            }}
                            activeOpacity={0.75}
                          >
                            <Users size={13} color={theme.colors.amber[500]} strokeWidth={2} />
                            <Text
                              style={[
                                styles.cardButtonText,
                                { color: rp ? rp.textSecondary : theme.colors.textSecondary },
                                rp ? { fontFamily: fontFamily.dmSansMedium } : null,
                              ]}
                            >
                              Group streak
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        {showQuickMarkComplete ? (
                          <TouchableOpacity
                            style={[
                              styles.cardButton,
                              {
                                borderColor: rp ? rp.border : theme.colors.border,
                                backgroundColor: rp ? rp.chipBg : theme.colors.surfaceElevated,
                              },
                            ]}
                            onPress={(event) => {
                              event.stopPropagation();
                              handleCardLongPress();
                            }}
                            activeOpacity={0.75}
                          >
                            <Check size={13} color={theme.colors.green[500]} strokeWidth={2.5} />
                            <Text
                              style={[
                                styles.cardButtonText,
                                { color: rp ? rp.textSecondary : theme.colors.textSecondary },
                                rp ? { fontFamily: fontFamily.dmSansMedium } : null,
                              ]}
                            >
                              Mark done
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
            </View>

            <View
              style={[
                styles.ringWrap,
                {
                  width: 76,
                  height: 76,
                  padding: 10,
                },
              ]}
            >
              <MiniDayGrid
                size={56}
                totalDays={totalDays}
                habit={item}
                nowMs={nowMs}
                completedDateSet={completedDateSet}
                doneColor={
                  missionFailed
                    ? theme.colors.red[900]
                    : missionWon
                      ? theme.colors.green[900]
                      : needsReport
                        ? theme.colors.amber[500]
                        : rp ? rp.accent : theme.colors.green[900]
                }
                emptyColor={
                  rp
                    ? rp.trackBg
                    : isDark
                      ? withAlpha(theme.colors.textSecondary, 22)
                      : withAlpha(theme.colors.textMuted, 18)
                }
                activeDateStr={activeCheckinDateStr}
                activeColor={theme.colors.red[500]}
                reduceMotion={reduceMotion}
                repairDateStr={
                  repair && !missionWon && !missionFailed && !needsReport ? repair.dateStr : null
                }
                repairColor={rp ? rp.textMuted : theme.colors.textMuted}
                onRepairPress={() => {
                  if (!repair) return;
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: `/habit/${item.id}`,
                    params: { repair: "1", repairDate: repair.dateStr },
                  });
                }}
              />
            </View>
        </Pressable>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    card: {
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    topHighlight: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 18,
    },
    cardContent: { flex: 1, justifyContent: 'space-between', minHeight: 80, paddingRight: 90 },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 },
    // Anchored to `ringWrap` itself (not `cardContent`) via `bottom: '100%'` — sits
    // flush above wherever the ring visually ends up, regardless of how tall
    // `cardContent`'s own content is. Anchoring to cardContent instead (the previous
    // approach) broke on short cards: `card`'s row centers cardContent and the ring
    // against each other by whichever is taller, so on a short card the ring's own
    // top could land above where this text assumed clear space, and the two visibly
    // collided. `right: 0` lines the text's right edge up with the ring's; an
    // explicit `width` (rather than leaving it to size from content) is required
    // here — an absolutely positioned node with only `right` set still got an
    // ellipsis-truncated single line in practice, so a fixed width wide enough for
    // the longest status string ("Confirm mission outcome") is used instead, with
    // `textAlign: 'right'` keeping shorter strings flush with the ring.
    cardStreakTopRight: {
        position: 'absolute',
        bottom: '100%',
        right: 0,
        width: 170,
        marginBottom: 6,
        fontWeight: '600',
        fontSize: 12,
        textAlign: 'right',
    },
    reportPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
    contextPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingVertical: 1.5,
        paddingHorizontal: 5,
        borderRadius: 999,
        borderWidth: 1,
    },
    contextPillText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.2 },
    streakInline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
    },
    streakInlineText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.2 },
    pulseGlyphWrap: {
        width: 16,
        height: 16,
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
    },
    pulseGlyphHalo: {
        position: "absolute",
        width: 14,
        height: 14,
        borderRadius: 7,
    },
    pulseGlyphRing: {
        position: "absolute",
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 1.5,
    },
    pulseGlyphDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    ringWrap: { position: "absolute", top: 16, right: 16, alignItems: "center", justifyContent: "center", flexDirection: "column" },
    ringCenter: { alignItems: "center", justifyContent: "center" },
    ringCenterInner: { alignItems: "center", justifyContent: "center" },
    ringInner: { alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
    cardTitle: { fontWeight: '800', marginBottom: 12, flexShrink: 1, fontSize: 18, lineHeight: 24 },
    cardStats: { flexDirection: 'row', alignItems: 'center', marginTop: 10, flexWrap: 'nowrap', gap: 6 },
    cardStreak: { fontWeight: '600', fontSize: 12 },
    cardProgress: { flexShrink: 0 },
    groupStreakBadge: {
        position: 'absolute',
        top: -9,
        left: -9,
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    quickCompleteHint: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.1 },
    progressText: { fontWeight: '700', fontSize: 18 },
    streakNumber: { fontWeight: "800", fontSize: 12.5, letterSpacing: -0.15, lineHeight: 15 },
    streakMicroLabel: { fontSize: 8.5, fontWeight: "900", letterSpacing: 1.0, marginTop: 1 },
    flameStack: { position: 'relative', width: 20, height: 18 },
    progressBarBg: {
        height: 4,
        backgroundColor: 'rgba(100, 116, 139, 0.3)',
        borderRadius: 2,
        marginTop: 8,
        overflow: 'hidden',
        width: '90%',
    },
    cardButtons: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 12,
    },
    cardButton: {
        flex: 1,
        maxWidth: '50%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 6,
        borderWidth: 1,
    },
    cardButtonPrimary: {
        borderWidth: 1,
    },
    cardButtonText: {
        fontSize: 12,
        fontWeight: '500',
    },
});
