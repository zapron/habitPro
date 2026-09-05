export type LiveMiniSquadStatus = "active" | "ended" | "cancelled";

export type LiveMiniParticipantRole = "creator" | "member";

export type LiveMiniParticipantStatus =
  | "invited"
  | "expired"
  | "declined"
  | "joined"
  | "in_progress"
  | "completed"
  | "missed"
  | "cancelled";

export type LiveMiniSquadRow = {
  id: string;
  creator_id: string;
  creator_mini_mission_id: string;
  title: string;
  objective: string | null;
  status: LiveMiniSquadStatus;
  /** Snapshot of the creator mission's task checklist at squad-creation time. Raw jsonb — parse with parseTaskChecklist. */
  task_checklist: unknown;
  created_at: string;
  updated_at: string;
};

/**
 * One task's photo/note within a Live Squad participant's completion memory. Same shape as
 * `CommunityMemoryGalleryItem` (communityWinsApi.ts) but kept as a separate type per this
 * codebase's per-surface porting convention (see docs/MINI_MISSION_CATALOG_ARCHITECTURE.md).
 */
export type LiveMiniMemoryGalleryItem = {
  taskId: string;
  label: string;
  note: string | null;
  imageUrl: string | null;
};

export type LiveMiniParticipantRow = {
  id: string;
  squad_id: string;
  user_id: string;
  role: LiveMiniParticipantRole;
  status: LiveMiniParticipantStatus;
  invite_expires_at: string | null;
  local_mini_mission_id: string | null;
  planned_minutes: number | null;
  reserve_minutes: number;
  started_at: string | null;
  deadline_at: string | null;
  completed_at: string | null;
  final_elapsed_seconds: number | null;
  memory_note: string | null;
  memory_image_url: string | null;
  memory_gallery: LiveMiniMemoryGalleryItem[] | null;
  created_at: string;
  updated_at: string;
};

export type LiveMiniProfileLabel = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  xp: number | null;
};

export type LiveMiniSquadSnapshot = {
  squad: LiveMiniSquadRow;
  participants: LiveMiniParticipantRow[];
  profiles: Record<string, LiveMiniProfileLabel>;
};
