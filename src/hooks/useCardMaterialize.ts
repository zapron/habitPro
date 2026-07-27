import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { useReducedMotion } from "./useReducedMotion";

/** Per-card stagger — capped so a long list's later cards don't wait forever. */
const CARD_MATERIALIZE_STAGGER_MS = 55;
const CARD_MATERIALIZE_STAGGER_CAP_MS = 420;
const CARD_MATERIALIZE_DURATION_MS = 260;
const CARD_MATERIALIZE_START_SCALE = 0.88;

/**
 * "Forming in place" mount animation — an alternative to
 * `useListCardEntrance`'s slide-up-from-below for grids where siblings can
 * have very different natural heights (e.g. a masonry mini-mission grid).
 * A synchronized *slide* between differently-sized neighbors reads as a
 * shared shape while it's moving ("common fate" grouping) even though each
 * card's real size never changes — a pure opacity+scale materialize has no
 * directional motion to group on, so each card's true size stays legible
 * throughout, not just once it settles. Plain `Animated.timing`/ease-out, no
 * spring overshoot, for a clean "appear" rather than a bounce.
 */
export function useCardMaterialize(index: number) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    const delay = Math.min(index * CARD_MATERIALIZE_STAGGER_MS, CARD_MATERIALIZE_STAGGER_CAP_MS);
    const anim = Animated.timing(progress, {
      toValue: 1,
      delay,
      duration: CARD_MATERIALIZE_DURATION_MS,
      easing: Easing.out(Easing.cubic),
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
        opacity: progress,
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [CARD_MATERIALIZE_START_SCALE, 1],
            }),
          },
        ],
      };
}
