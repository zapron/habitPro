export type LiveMiniSquadStatus = "active" | "ended" | "cancelled";

export type LiveMiniParticipantRole = "creator" | "member";

export type LiveMiniParticipantStatus =
  | "invited"
  /** Self-requested via a shared link, awaiting creator approval — distinct
   * from "invited" (creator-initiated, no approval step needed). */
  | "link_requested"
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
  /** Snapshot of the creator mission's captureMode at squad-creation time. "freeform" or null (classic/checklist). */
  capture_mode: string | null;
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

/** What a non-participant sees before deciding whether to request joining via
 * a shared link — deliberately minimal, same shape/purpose as
 * ChallengePublicPreview (groupChallengesApi.ts). */
export type LiveMiniPublicPreview = {
  squadId: string;
  title: string;
  objective: string | null;
  status: LiveMiniSquadStatus;
  creatorUsername: string | null;
  creatorDisplayName: string | null;
  participantCount: number;
  myStatus: "creator" | LiveMiniParticipantStatus | "none";
  /** Snapshot of the creator mission's task checklist, same as
   * LiveMiniSquadRow.task_checklist — raw jsonb, parse with
   * parseTaskChecklist. Present so a link-join requester (who can't see the
   * full RLS-gated snapshot yet) still inherits the creator's tasks. */
  taskChecklist: unknown;
  /** Snapshot of the creator mission's captureMode, same as
   * LiveMiniSquadRow.capture_mode. */
  captureMode: string | null;
};
