import type { AiCoachResponse, AiCoachSnapshot, AiCoachSuggestion } from "./types";

function firstActive(snapshot: AiCoachSnapshot) {
  return (
    snapshot.habits.find((h) => h.status === "active") ??
    snapshot.habits.find((h) => h.status === "needs_report") ??
    snapshot.habits[0] ??
    null
  );
}

function withUsage(response: Omit<AiCoachResponse, "usage">): AiCoachResponse {
  return {
    ...response,
    usage: {
      premium: false,
      limitPerDay: 999,
      usedToday: 0,
      remainingToday: 999,
    },
  };
}

export function buildLocalMockCoachResponse(
  snapshot: AiCoachSnapshot,
  note = "Local mock fallback is active for developer testing.",
): AiCoachResponse {
  const suggestions: AiCoachSuggestion[] = [];
  const habit = firstActive(snapshot);

  if (snapshot.stats.pendingReports > 0) {
    suggestions.push({
      id: "local-review",
      title:
        snapshot.stats.pendingReports === 1
          ? "Close the open report"
          : `Close ${snapshot.stats.pendingReports} open reports`,
      body: "Finish the pending review first so your board becomes clean before starting the next move.",
      priority: "high",
      reason: "Pending reports are the highest-friction item on the board.",
      action: { type: "open_reports", label: "Open Reports" },
    });
  }

  if (habit?.status === "active") {
    suggestions.push({
      id: "local-protect",
      title: habit.streak >= 3 ? `Protect the ${habit.streak}-day streak` : `Check in on ${habit.title}`,
      body: `Do the smallest honest version of "${habit.title}" today. The AI spike never marks it done for you.`,
      priority: suggestions.length === 0 ? "high" : "medium",
      reason: habit.isSquadMission ? "Squad mission momentum is visible to your group." : undefined,
      action: { type: "open_habit", label: "Open Mission", habitId: habit.id },
    });
  }

  if (snapshot.stats.liveMiniMissions > 0 || snapshot.stats.waitingMiniMissions > 0) {
    suggestions.push({
      id: "local-mini",
      title: snapshot.stats.liveMiniMissions > 0 ? "Finish the live mini now" : "Start a short mini",
      body: "Use a tiny side quest when the main mission feels too big.",
      priority: suggestions.length === 0 ? "high" : "low",
      action: { type: "open_mini", label: "Open Mini" },
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: "local-create",
      title: "Draft a frictionless first mission",
      body: "Start with a 21-day promise that is small enough to repeat even on a low-energy day.",
      priority: "high",
      reason: "No urgent mission or mini is currently blocking the board.",
      action: {
        type: "prefill_habit",
        label: "Draft Mission",
        title: "10-minute daily reset",
        description: "Do one focused 10-minute reset at the same time each day. Keep the promise small and repeatable.",
        mode: "autopilot",
      },
    });
  }

  return withUsage({
    schema: "habitpro.aiCoach.v1",
    provider: "mock",
    generatedAt: new Date().toISOString(),
    headline:
      snapshot.stats.pendingReports > 0
        ? "Clean up the board first"
        : habit
          ? "Protect today’s momentum"
          : "Draft a small first win",
    subheadline: note,
    suggestions: suggestions.slice(0, 3),
  });
}

