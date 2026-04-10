import type { ProgressivePhase } from "../components/SplitFlapTimeDisplay";

/** Full DD:HH:MM:SS (e.g. fixed-width layouts). */
export function remainingMsToDdHhMmSs(remainingMs: number): string {
  const ms = Math.max(0, Math.floor(remainingMs));
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Countdown with leading zero units omitted (inverse of autopilot count-up).
 * Under 1 day: HH:MM:SS; under 1 hour: MM:SS; under 1 minute: seconds only.
 */
export function remainingMsToProgressiveCountdown(remainingMs: number): {
  display: string;
  phase: ProgressivePhase;
} {
  const ms = Math.max(0, Math.floor(remainingMs));
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (days > 0) {
    return {
      phase: "ddhhmmss",
      display: `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    };
  }
  if (hours > 0) {
    return {
      phase: "hhmmss",
      display: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    };
  }
  if (minutes > 0) {
    return {
      phase: "mmss",
      display: `${pad(minutes)}:${pad(seconds)}`,
    };
  }
  return {
    phase: "ss",
    display: pad(seconds),
  };
}
