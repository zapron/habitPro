import type { HabitMode } from "../../types/habit";

export type AiCoachCreatePrefill = {
  title: string;
  description?: string;
  mode: HabitMode;
  totalDays?: number;
};

function firstParam(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max).trim() : trimmed;
}

export function readAiCoachCreatePrefill(params: Record<string, unknown>): AiCoachCreatePrefill | null {
  const title = clamp(firstParam(params.aiTitle), 80);
  if (!title) return null;

  const description = clamp(firstParam(params.aiDescription), 240);
  const rawMode = firstParam(params.aiMode);
  const mode: HabitMode = rawMode === "manual" ? "manual" : "autopilot";
  const rawDays = Number.parseInt(firstParam(params.aiTotalDays), 10);
  const totalDays = Number.isFinite(rawDays) ? Math.max(1, Math.min(365, rawDays)) : undefined;

  return {
    title,
    description: description || undefined,
    mode,
    totalDays: mode === "manual" ? totalDays ?? 30 : undefined,
  };
}

export function buildAiCoachCreateUrl(input: AiCoachCreatePrefill): string {
  const params = new URLSearchParams();
  params.set("aiTitle", input.title);
  if (input.description) params.set("aiDescription", input.description);
  params.set("aiMode", input.mode);
  if (input.mode === "manual" && input.totalDays) {
    params.set("aiTotalDays", String(input.totalDays));
  }
  return `/create?${params.toString()}`;
}

