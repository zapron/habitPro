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
import { LinearGradient } from 'expo-linear-gradient';
import { Flame, Check, CircleX, Plane, Gamepad2, Globe, Swords, Users } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
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
}

export const HabitCard = memo(({ item, nowMs, index }: HabitCardProps) => {
    const router = useRouter();
    const { theme, isDark } = useTheme();
    const reduceMotion = useReducedMotion();
    const totalDays = Math.max(1, item.totalDays ?? 21);
    const needsReport = useMemo(() => needsMainMissionOutcome(item, nowMs), [item, nowMs]);
    const missionWon = item.missionReport === 'accomplished';
    const missionFailed = item.missionReport === 'failed';
    const failedOutcomeColor = isDark ? "#fca5a5" : "#fb7185";
    const isManual = (item.mode ?? 'autopilot') === 'manual';
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
    const taskProgressLabel = showQuickMarkComplete
      ? loggedChecklistTasks >= totalChecklistTasks
        ? "All tasks logged"
        : `${loggedChecklistTasks}/${totalChecklistTasks} tasks pending`
      : null;

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

    const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
    const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.62] });

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

    return (
        <Animated.View style={entranceStyle}>
        <Pressable
            onPress={openHabit}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
            style={[
                styles.card,
                {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.lg,
                    borderColor: theme.colors.border,
                    ...theme.shadow.card,
                },
            ]}
        >
            <LinearGradient
                pointerEvents="none"
                colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.topHighlight, { borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }]}
            />
            <View style={styles.cardContent}>
                    <View style={styles.pillRow}>
                            {isManual ? (
                                <Gamepad2 size={14} color={theme.colors.amber[500]} />
                            ) : (
                                <Plane size={14} color={theme.colors.cyan[400]} />
                            )}
                            {(item.visibility ?? 'solo') === 'public' && (
                                <Globe size={14} color={theme.colors.cyan[400]} />
                            )}
                            {Boolean(item.challengeGroupId) && (
                                <Swords size={14} color={theme.colors.indigo[400]} />
                            )}
                            {streakCheckinAvailable && !missionWon && !missionFailed ? (
                                <View
                                    style={styles.pulseGlyphWrap}
                                    accessibilityLabel="Streak check-in available"
                                    accessibilityRole="image"
                                >
                                    <Animated.View
                                        pointerEvents="none"
                                        style={[
                                            styles.pulseGlyphHalo,
                                            {
                                                borderColor: theme.colors.cyan[400],
                                                backgroundColor: "rgba(34, 211, 238, 0.10)",
                                                transform: [{ scale: reduceMotion ? 1 : pulseScale }],
                                                opacity: reduceMotion ? 0.5 : pulseOpacity,
                                            },
                                        ]}
                                    />
                                </View>
                            ) : null}
                            {item.missionReport === 'accomplished' && (
                                <Text style={[styles.reportPillText, { color: theme.colors.green[500] }]}>ACCOMPLISHED</Text>
                            )}
                            {needsReport && (
                                <Text style={[styles.reportPillText, { color: theme.colors.amber[500] }]}>REVIEW DUE</Text>
                            )}
                            {repair && !missionWon && !missionFailed && !needsReport ? (
                              <TouchableOpacity
                                onPress={() => {
                                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  router.push({
                                    pathname: `/habit/${item.id}`,
                                    params: { repair: "1", repairDate: repair.dateStr },
                                  });
                                }}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel="Repair streak"
                              >
                                <Text style={[styles.repairCta, { color: theme.colors.amber[500] }]}>REPAIR</Text>
                              </TouchableOpacity>
                            ) : null}
                            {taskProgressLabel ? (
                                <View
                                    style={[
                                        styles.taskProgressPill,
                                        loggedChecklistTasks >= totalChecklistTasks
                                            ? {
                                                  borderColor: isDark ? 'rgba(34, 197, 94, 0.5)' : 'rgba(21, 128, 61, 0.32)',
                                                  backgroundColor: isDark ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)',
                                              }
                                            : {
                                                  borderColor: isDark ? 'rgba(34, 211, 238, 0.5)' : 'rgba(8, 145, 178, 0.32)',
                                                  backgroundColor: isDark ? 'rgba(34, 211, 238, 0.12)' : 'rgba(34, 211, 238, 0.08)',
                                              },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.taskProgressPillText,
                                            {
                                                color:
                                                    loggedChecklistTasks >= totalChecklistTasks
                                                        ? theme.colors.green[500]
                                                        : theme.colors.cyan[500],
                                            },
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {taskProgressLabel}
                                    </Text>
                                </View>
                            ) : null}
                    </View>

                    <Text style={[styles.cardTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>{item.title}</Text>

                    {showQuickMarkComplete || item.challengeGroupId ? (
                      <View style={styles.cardStats}>
                          {item.challengeGroupId ? (
                            <TouchableOpacity
                                onPress={(event) => {
                                    event.stopPropagation();
                                    router.push(`/challenge/${item.challengeGroupId}`);
                                }}
                                activeOpacity={0.82}
                                style={[
                                    styles.groupStreakButton,
                                    {
                                        borderColor: isDark ? 'rgba(245, 158, 11, 0.72)' : 'rgba(217, 119, 6, 0.42)',
                                        backgroundColor: isDark ? 'rgba(245, 158, 11, 0.13)' : 'rgba(245, 158, 11, 0.10)',
                                    },
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel="View group streaks"
                            >
                                <Users size={12} color={theme.colors.amber[500]} strokeWidth={2.6} />
                                <Text style={[styles.groupStreakButtonText, { color: theme.colors.amber[500] }]} numberOfLines={1}>
                                    Group Streaks
                                </Text>
                            </TouchableOpacity>
                          ) : null}
                          {showQuickMarkComplete ? (
                            <TouchableOpacity
                                onPress={handleQuickMarkComplete}
                                activeOpacity={0.82}
                                style={[
                                    styles.markCompleteButton,
                                    {
                                        borderColor: isDark ? 'rgba(34, 197, 94, 0.72)' : 'rgba(21, 128, 61, 0.42)',
                                        backgroundColor: isDark ? 'rgba(34, 197, 94, 0.13)' : 'rgba(34, 197, 94, 0.10)',
                                    },
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel="Mark today complete"
                            >
                                <Check size={12} color={theme.colors.green[500]} strokeWidth={2.8} />
                                <Text style={[styles.markCompleteButtonText, { color: theme.colors.green[500] }]} numberOfLines={1}>
                                    Quick Complete
                                </Text>
                            </TouchableOpacity>
                          ) : null}
                      </View>
                    ) : null}
            </View>

            {(() => {
              const ringSize = HABIT_RING_SIZE;
              const strokeWidth = 4;
              const slot = getHabitActiveMissionDaySlot(item, nowMs);
              const useLightweightRing =
                Platform.OS === "android" && totalDays > ANDROID_SEGMENTED_RING_DAY_LIMIT;

              return (
                <View
                  style={[
                    styles.ringWrap,
                    { width: ringSize, height: ringSize },
                    !missionFailed && { marginTop: HABIT_RING_LABEL_GAP },
                  ]}
                >
                  {!missionFailed ? (
                    <Text
                        style={[
                            styles.cardStreakTopRight,
                            missionWon
                                ? { color: theme.colors.green[500] }
                                : needsReport
                                    ? { color: theme.colors.amber[500] }
                                : item.streak >= 14
                                    ? { color: '#fbbf24' }
                                    : item.streak >= 7
                                        ? { color: '#f59e0b' }
                                        : item.streak > 0
                                            ? { color: theme.colors.amber[500] }
                                            : { color: theme.colors.textMuted },
                        ]}
                        numberOfLines={1}
                    >
                        {missionWon
                            ? 'Completed!'
                            : needsReport
                              ? 'Confirm mission outcome'
                              : `${Math.round(campaignProgress * 100)}% Complete`}
                    </Text>
                  ) : null}
                  {!missionWon && !missionFailed && useLightweightRing ? (
                    <LightweightMissionRing
                      ringSize={ringSize}
                      strokeWidth={strokeWidth}
                      progress={campaignProgress}
                      doneColor={theme.colors.indigo[400]}
                      futureColor={isDark ? "rgba(148, 163, 184, 0.22)" : "rgba(100, 116, 139, 0.22)"}
                    />
                  ) : !missionWon && !missionFailed ? (
                    <RingDayArcs
                      ringSize={ringSize}
                      strokeWidth={strokeWidth}
                      totalDays={totalDays}
                      slot={slot}
                      habit={item}
                      nowMs={nowMs}
                      // Use brand color for "done", and a calmer neutral for "missed".
                      doneColor={theme.colors.indigo[400]}
                      missedColor={isDark ? "rgba(148, 163, 184, 0.55)" : "rgba(100, 116, 139, 0.55)"}
                      pendingColor={isDark ? "rgba(148, 163, 184, 0.75)" : "rgba(100, 116, 139, 0.75)"}
                      futureColor={isDark ? "rgba(148, 163, 184, 0.22)" : "rgba(100, 116, 139, 0.22)"}
                      completedDateSet={completedDateSet}
                    />
                  ) : null}

                  <View
                    style={[
                      styles.ringCenter,
                      {
                        width: ringSize - strokeWidth * 2 - 6,
                        height: ringSize - strokeWidth * 2 - 6,
                        borderRadius: (ringSize - strokeWidth * 2 - 6) / 2,
                        backgroundColor: theme.colors.surfaceElevated,
                      },
                    ]}
                  >
                    {missionWon ? (
                      <Check size={20} color={theme.colors.green[500]} strokeWidth={3} />
                    ) : missionFailed ? (
                      <CircleX size={38} color={failedOutcomeColor} strokeWidth={2.1} />
                    ) : (
                      <View style={styles.ringCenterInner}>
                        <Text
                          style={[
                            styles.streakNumber,
                            {
                              color: theme.colors.textPrimary,
                              ...(isDark
                                ? {
                                    textShadowColor: "rgba(0,0,0,0.45)",
                                    textShadowOffset: { width: 0, height: 1 },
                                    textShadowRadius: 3,
                                  }
                                : null),
                            },
                          ]}
                        >
                          {item.streak}d
                        </Text>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                          style={[styles.streakMicroLabel, { color: theme.colors.textMuted }]}
                        >
                          STREAK
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}
        </Pressable>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    card: {
        padding: 20,
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
    cardContent: { flex: 1 },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 8 },
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
    repairCta: { fontSize: 10, fontWeight: "900", letterSpacing: 0.9 },
    pulseGlyphWrap: {
        width: 16,
        height: 16,
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
    },
    pulseGlyphHalo: {
        position: "absolute",
        left: 2,
        top: 2,
        width: 12,
        height: 12,
        borderRadius: 3,
        borderWidth: 1,
        zIndex: 0,
    },
    ringWrap: { position: "relative", alignItems: "center", justifyContent: "center" },
    ringCenter: { alignItems: "center", justifyContent: "center" },
    ringCenterInner: { alignItems: "center", justifyContent: "center" },
    ringInner: { alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
    cardTitle: { fontWeight: '800', marginBottom: 4, flexShrink: 1 },
    taskProgressPill: {
        borderWidth: 1,
        borderRadius: 9999,
        paddingVertical: 3,
        paddingHorizontal: 9,
        flexShrink: 0,
    },
    taskProgressPillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.2 },
    cardStats: { flexDirection: 'row', alignItems: 'center', marginTop: 10, flexWrap: 'nowrap', gap: 6 },
    cardStreak: { fontWeight: '600', fontSize: 12 },
    cardProgress: { flexShrink: 0 },
    groupStreakButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        minHeight: 30,
        paddingVertical: 5,
        paddingHorizontal: 8,
        borderRadius: 10,
        borderWidth: 1,
        flexShrink: 1,
        minWidth: 0,
        overflow: 'hidden',
    },
    groupStreakButtonText: { fontSize: 10, fontWeight: '900', letterSpacing: 0, flexShrink: 1 },
    markCompleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        minHeight: 30,
        paddingVertical: 5,
        paddingHorizontal: 8,
        borderRadius: 10,
        borderWidth: 1,
        flexShrink: 1,
        minWidth: 0,
        overflow: 'hidden',
    },
    markCompleteButtonText: { fontSize: 10, fontWeight: '900', letterSpacing: 0, flexShrink: 1 },
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
});
