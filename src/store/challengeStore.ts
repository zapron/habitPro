import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  ChallengeEnrollment,
  ChallengeTemplateId,
  CompletedChallengeRecord,
} from "../types/challenge";
import { getChallengeTemplate } from "../constants/challengeTemplates";
import { computeChallengeProgress } from "../utils/challengeProgress";
import type { Habit, MiniMission } from "../types/habit";

const MAX_CONCURRENT = 2;

type ChallengeStoreState = {
  enrollments: ChallengeEnrollment[];
  completed: CompletedChallengeRecord[];
  enroll: (templateId: ChallengeTemplateId) => { ok: true } | { ok: false; reason: string };
  abandon: (enrollmentId: string) => void;
  /** Call when habits/minis change or screen focuses — completes goals and drops expired failures. */
  reconcile: (habits: Habit[], miniMissions: MiniMission[]) => void;
  reset: () => void;
};

function newId(): string {
  return `ch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useChallengeStore = create<ChallengeStoreState>()(
  persist(
    (set, get) => ({
      enrollments: [],
      completed: [],

      enroll: (templateId) => {
        const template = getChallengeTemplate(templateId);
        if (!template) return { ok: false, reason: "Unknown challenge." };

        const { enrollments } = get();
        if (enrollments.length >= MAX_CONCURRENT) {
          return { ok: false, reason: `You can run up to ${MAX_CONCURRENT} challenges at once.` };
        }
        if (enrollments.some((e) => e.templateId === templateId)) {
          return { ok: false, reason: "You already have this challenge active." };
        }

        const enrollment: ChallengeEnrollment = {
          id: newId(),
          templateId,
          startedAt: new Date().toISOString(),
        };

        set({ enrollments: [...enrollments, enrollment] });
        return { ok: true };
      },

      abandon: (enrollmentId) => {
        set((s) => ({
          enrollments: s.enrollments.filter((e) => e.id !== enrollmentId),
        }));
      },

      reconcile: (habits, miniMissions) => {
        const now = Date.now();
        const { enrollments, completed } = get();
        let nextEnrollments = [...enrollments];
        const nextCompleted = [...completed];

        const toRemove: string[] = [];

        for (const e of nextEnrollments) {
          const template = getChallengeTemplate(e.templateId);
          if (!template) {
            toRemove.push(e.id);
            continue;
          }
          const progress = computeChallengeProgress(template, e.startedAt, habits, miniMissions, now);
          if (progress.done) {
            toRemove.push(e.id);
            nextCompleted.unshift({
              templateId: e.templateId,
              completedAt: new Date().toISOString(),
            });
          } else if (progress.expired) {
            toRemove.push(e.id);
          }
        }

        nextEnrollments = nextEnrollments.filter((e) => !toRemove.includes(e.id));
        const trimmedCompleted = nextCompleted.slice(0, 24);

        set({ enrollments: nextEnrollments, completed: trimmedCompleted });
      },

      reset: () => set({ enrollments: [], completed: [] }),
    }),
    {
      name: "challenge-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
