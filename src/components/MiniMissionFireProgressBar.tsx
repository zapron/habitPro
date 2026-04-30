import React from "react";

import { FireProgressBar } from "./FireProgressBar";

const EXPLOSION_LOTTIE_URI =
  "https://fonts.gstatic.com/s/e/notoemoji/latest/1f4a5/lottie.json";

type MiniMissionFireProgressBarProps = {
  progress: number;
  isDark: boolean;
  showCompleteEffect?: boolean;
};

export function MiniMissionFireProgressBar({
  progress,
  isDark,
  showCompleteEffect = false,
}: MiniMissionFireProgressBarProps) {
  return (
    <FireProgressBar
      progress={progress}
      isDark={isDark}
      height={6}
      fireSize={34}
      completeEffectSource={
        showCompleteEffect ? { uri: EXPLOSION_LOTTIE_URI } : undefined
      }
      completeEffectSize={52}
      completeEffectLoop
      accessibilityLabel={
        showCompleteEffect ? "Mission timer finished" : undefined
      }
    />
  );
}
