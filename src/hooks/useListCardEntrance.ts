import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { useReducedMotion } from "./useReducedMotion";

/** Per-card stagger for the "stack up from below" mount animation — capped so a long list's later cards don't wait forever. */
const LIST_CARD_ENTRANCE_STAGGER_MS = 70;
const LIST_CARD_ENTRANCE_STAGGER_CAP_MS = 480;
const LIST_CARD_ENTRANCE_RISE_PX = 42;

/**
 * "Stack up from below" mount animation shared by list/grid cards across the
 * app (HabitCard, ParticipantCard, LeagueRow/ActiveChallengeCard, ...). Fires
 * once per fresh mount — initial load, a tab switch that remounts the list,
 * or a newly appended row after a "Load more" action, since each gets a
 * genuinely new key/mount. Must be called unconditionally on every render of
 * the host component, before any early return, like any other hook.
 */
export function useListCardEntrance(index: number) {
  const reduceMotion = useReducedMotion();
  const entrance = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return undefined;
    }
    const delay = Math.min(index * LIST_CARD_ENTRANCE_STAGGER_MS, LIST_CARD_ENTRANCE_STAGGER_CAP_MS);
    const anim = Animated.spring(entrance, {
      toValue: 1,
      delay,
      friction: 6,
      tension: 100,
      useNativeDriver: true,
      isInteraction: false,
    });
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return reduceMotion
    ? null
    : {
        opacity: entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" as const }),
        transform: [
          {
            // No clamp here — the spring's natural overshoot past 1 is what
            // gives the "punched up by force" feel, not just a plain ease-in.
            translateY: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [LIST_CARD_ENTRANCE_RISE_PX, 0],
            }),
          },
        ],
      };
}
