/**
 * Which mini mission's detail screen is currently on-screen and focused, if any.
 * Set/cleared by `app/mini/[id].tsx`'s own focus state. Exists so the notification
 * foreground handler (`src/utils/notifications.ts`, a module with no navigation
 * context of its own) can decide whether a given mission's OS notification would be
 * redundant with what the user is already looking at — a pure display-time read,
 * never touches notification scheduling/cancellation.
 */
let focusedMiniMissionId: string | null = null;

export function setFocusedMiniMissionId(id: string | null): void {
  focusedMiniMissionId = id;
}

export function getFocusedMiniMissionId(): string | null {
  return focusedMiniMissionId;
}
