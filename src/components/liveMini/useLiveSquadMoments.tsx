import { useCallback, useMemo, useRef, useState } from "react";
import { Keyboard } from "react-native";
import { LazyMount } from "../LazyMount";
import { StreakMemorySheet } from "../StreakMemorySheet";
import { showAppAlert } from "../../context/AppDialogContext";
import { buildLiveMiniMemoryGallery, syncLiveMiniFromLocalMission } from "../../lib/liveMiniMissionProgress";
import {
  canUseStreakMemoryUpload,
  shouldUploadLocalStreakImage,
  uploadMiniStreakTaskMemoryImage,
} from "../../lib/streakMemoryStorage";
import { useHabitStore } from "../../store/habitStore";
import type { MiniMission, StreakMemory, StreakMemoryTaskEntry, TaskChecklistItem } from "../../types/habit";
import type { LiveMiniMemoryGalleryItem } from "../../types/liveMiniMission";

/**
 * Log, edit and delete your own moments in place: on the live squad board and
 * on the mini mission screen. Same data and the same capture sheet as the mini mission screen
 * (app/mini/[id].tsx): freeform moments go to `draftMemories`, checklist tasks
 * to `draftTasks`, then the drafts are synced to the squad. The caller gets the
 * new gallery right away so the feed updates before the round trip.
 */

type SheetState =
  | { kind: "freeform-create"; entryId: string; label: string; prefill?: { note?: string } }
  | { kind: "freeform-edit"; entry: StreakMemoryTaskEntry }
  | { kind: "task"; task: TaskChecklistItem; prior?: StreakMemoryTaskEntry }
  | null;

export type LiveSquadComposerMode = "freeform" | "checklist" | null;

function newFreeformId(): string {
  return `freeform-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function proofUrlFor(memory: StreakMemory | null, missionId: string, taskId: string): Promise<string | undefined> {
  let proofUrl = memory?.imageUrl?.trim() || undefined;
  if (memory && !proofUrl && memory.imageUri) {
    if (canUseStreakMemoryUpload() && shouldUploadLocalStreakImage(memory.imageUri)) {
      try {
        proofUrl = await uploadMiniStreakTaskMemoryImage({ miniMissionId: missionId, taskId, localUri: memory.imageUri });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showAppAlert("Photo upload failed", msg, [{ text: "OK" }]);
        proofUrl = memory.imageUri;
      }
    } else {
      proofUrl = memory.imageUri;
    }
  }
  return proofUrl;
}

export function useLiveSquadMoments(
  mission: MiniMission | undefined,
  enabled: boolean,
  onGalleryChanged: (gallery: LiveMiniMemoryGalleryItem[]) => void,
  /** The squad's own task list: used if this device's mission copy lacks one. */
  squadChecklist?: TaskChecklistItem[] | null,
  /** false where the screen already syncs drafts itself (the mini mission screen). */
  syncToSquad = true,
) {
  const [sheet, setSheet] = useState<SheetState>(null);
  const sheetRef = useRef<SheetState>(null);
  sheetRef.current = sheet;

  const checklist =
    mission?.taskChecklist && mission.taskChecklist.length > 0
      ? mission.taskChecklist
      : mission?.captureMode !== "freeform" && squadChecklist && squadChecklist.length > 0
        ? squadChecklist
        : null;
  const isChecklistRef = useRef(false);
  isChecklistRef.current = checklist !== null;
  const checklistRef = useRef(checklist);
  checklistRef.current = checklist;
  const mode: LiveSquadComposerMode = !enabled || !mission
    ? null
    : checklist
      ? "checklist"
      : mission.captureMode === "freeform"
        ? "freeform"
        : null;
  const missionId = mission?.id ?? null;

  const loggedTaskIds = useMemo(() => new Set(Object.keys(mission?.draftTasks ?? {})), [mission?.draftTasks]);
  const remainingTasks = useMemo(
    () => (checklist ? checklist.filter((t) => !loggedTaskIds.has(t.id)).length : 0),
    [checklist, loggedTaskIds],
  );

  /** Push the store's latest drafts to the feed (instantly) and to the squad. */
  const afterChange = useCallback(() => {
    if (!missionId) return;
    const latest = useHabitStore.getState().getMiniMission(missionId);
    if (!latest) return;
    const entries = isChecklistRef.current ? Object.values(latest.draftTasks ?? {}) : latest.draftMemories ?? [];
    onGalleryChanged(buildLiveMiniMemoryGallery(entries) ?? []);
    if (syncToSquad && latest.liveSquadId && latest.status === "in_progress") void syncLiveMiniFromLocalMission(latest);
  }, [missionId, onGalleryChanged, syncToSquad]);

  const postText = useCallback(
    (text: string) => {
      const note = text.trim();
      if (!missionId || !note) return;
      const latest = useHabitStore.getState().getMiniMission(missionId);
      const count = latest?.draftMemories?.length ?? 0;
      const entryId = newFreeformId();
      useHabitStore.getState().setMiniMissionFreeformMemory(missionId, entryId, {
        taskId: entryId,
        label: `Moment ${count + 1}`,
        note,
        proofUrls: [],
        loggedAt: new Date().toISOString(),
      });
      afterChange();
    },
    [afterChange, missionId],
  );

  const openPhoto = useCallback(
    (draftNote?: string) => {
      if (!missionId) return;
      Keyboard.dismiss();
      const count = useHabitStore.getState().getMiniMission(missionId)?.draftMemories?.length ?? 0;
      setSheet({
        kind: "freeform-create",
        entryId: newFreeformId(),
        label: `Moment ${count + 1}`,
        prefill: draftNote?.trim() ? { note: draftNote.trim() } : undefined,
      });
    },
    [missionId],
  );

  const openTask = useCallback(
    (task: TaskChecklistItem) => {
      if (!missionId) return;
      Keyboard.dismiss();
      const prior = useHabitStore.getState().getMiniMission(missionId)?.draftTasks?.[task.id];
      setSheet({ kind: "task", task, prior });
    },
    [missionId],
  );

  /** Your own moment in the feed: edit it in the capture sheet. */
  const editMoment = useCallback(
    (taskId: string) => {
      if (!missionId) return;
      const latest = useHabitStore.getState().getMiniMission(missionId);
      if (!latest) return;
      const task = (checklistRef.current ?? latest.taskChecklist)?.find((t) => t.id === taskId);
      if (task) {
        setSheet({ kind: "task", task, prior: latest.draftTasks?.[taskId] });
        return;
      }
      const entry = latest.draftMemories?.find((e) => e.taskId === taskId);
      if (entry) setSheet({ kind: "freeform-edit", entry });
    },
    [missionId],
  );

  /** True when this moment is one of your drafts on this device (editable until you finish). */
  const ownsMoment = useCallback(
    (taskId: string) => {
      if (!mission || mission.status !== "in_progress") return false;
      return Boolean(mission.draftTasks?.[taskId]) || Boolean(mission.draftMemories?.some((e) => e.taskId === taskId));
    },
    [mission],
  );

  const deleteMoment = useCallback(
    (taskId: string) => {
      if (!missionId) return;
      const latest = useHabitStore.getState().getMiniMission(missionId);
      if (!latest) return;
      if (latest.draftTasks?.[taskId]) {
        useHabitStore.getState().removeMiniMissionDraftTask(missionId, taskId);
      } else {
        useHabitStore.getState().removeMiniMissionFreeformMemory(missionId, taskId);
      }
      afterChange();
    },
    [afterChange, missionId],
  );

  const handleCommit = useCallback(
    async (memory: StreakMemory | null) => {
      const ctx = sheetRef.current;
      if (!ctx || !missionId) return;
      if (ctx.kind === "task") {
        const proofUrl = await proofUrlFor(memory, missionId, ctx.task.id);
        useHabitStore.getState().setMiniMissionDraftTask(missionId, ctx.task.id, {
          taskId: ctx.task.id,
          label: ctx.task.label,
          note: memory?.note,
          proofUrls: proofUrl ? [proofUrl] : [],
          // Editing keeps the moment where it was in the feed.
          loggedAt: ctx.prior?.loggedAt ?? new Date().toISOString(),
          includedInShare: ctx.prior?.includedInShare,
        });
      } else {
        const entryId = ctx.kind === "freeform-create" ? ctx.entryId : ctx.entry.taskId;
        const label = ctx.kind === "freeform-create" ? ctx.label : ctx.entry.label;
        const prior = ctx.kind === "freeform-edit" ? ctx.entry : undefined;
        const proofUrl = await proofUrlFor(memory, missionId, entryId);
        useHabitStore.getState().setMiniMissionFreeformMemory(missionId, entryId, {
          taskId: entryId,
          label,
          note: memory?.note,
          proofUrls: proofUrl ? [proofUrl] : [],
          loggedAt: prior?.loggedAt ?? new Date().toISOString(),
          includedInShare: prior?.includedInShare,
        });
      }
      afterChange();
    },
    [afterChange, missionId],
  );

  const prefill =
    sheet?.kind === "freeform-create"
      ? sheet.prefill
      : sheet?.kind === "freeform-edit"
        ? { note: sheet.entry.note, imageUri: sheet.entry.proofUrls[0] }
        : sheet?.kind === "task" && sheet.prior
          ? { note: sheet.prior.note, imageUri: sheet.prior.proofUrls[0] }
          : undefined;
  const sheetTitle =
    sheet?.kind === "task"
      ? sheet.task.label
      : sheet?.kind === "freeform-edit"
        ? sheet.entry.label
        : sheet?.kind === "freeform-create"
          ? sheet.label
          : mission?.title ?? "";

  const sheetElement = mission ? (
    <LazyMount visible={sheet !== null} unmountOnExit>
      <StreakMemorySheet
        visible={sheet !== null}
        variant="mini"
        mode="create"
        hideCommunityPublish
        missionTitle={sheetTitle}
        dayLabel="1"
        prefill={prefill}
        onClose={() => setSheet(null)}
        onCommit={handleCommit}
      />
    </LazyMount>
  ) : null;

  return {
    mode,
    checklist,
    loggedTaskIds,
    remainingTasks,
    postText,
    openPhoto,
    openTask,
    editMoment,
    deleteMoment,
    ownsMoment,
    sheetElement,
  };
}
