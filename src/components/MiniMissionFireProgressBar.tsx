import React from "react";
import { FireProgressBar } from "./FireProgressBar";

/** Fire-burn bar for mini missions — delegates to FireProgressBar with mission-appropriate sizing. */
export function MiniMissionFireProgressBar({ progress, isDark }: { progress: number; isDark: boolean }) {
  return (
    <FireProgressBar
      progress={progress}
      isDark={isDark}
      height={6}
      fireSize={34}
    />
  );
}
