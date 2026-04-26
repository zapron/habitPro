import React, { useMemo } from "react";
import LottieView, { type AnimationObject } from "lottie-react-native";

/** Canonical Noto Emoji 🔥 Lottie — shared by FireProgressBar, home banner, etc. */
export const FIRE_LOTTIE_URI =
  "https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/lottie.json";

type Props = {
  /** Lottie JSON (local require or remote json object). */
  source: AnimationObject | { uri: string };
  /** Size of the rendered animation (square). */
  size?: number;
  /** Play/pause. */
  playing?: boolean;
  /** Loop forever. */
  loop?: boolean;
  /**
   * Best-effort tint for the animation. Works when the Lottie uses vector fills/strokes
   * and the runtime supports colorFilters for the asset.
   */
  tintColor?: string;
};

/**
 * Small wrapper so we can easily add/remove Lottie usage.
 * Keep all Lottie coupling isolated to this component.
 */
export function FireLottie({ source, size = 44, playing = true, loop = true, tintColor }: Props) {
  const style = useMemo(() => ({ width: size, height: size }), [size]);

  return (
    <LottieView
      source={source}
      autoPlay={playing}
      loop={loop}
      resizeMode="contain"
      colorFilters={tintColor ? [{ keypath: "**", color: tintColor }] : undefined}
      style={style}
    />
  );
}

