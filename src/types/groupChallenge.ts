/** Server-shaped rows for group habit challenges (Supabase). */

export type ChallengeGroupRow = {
  id: string;
  creator_id: string;
  title: string;
  habit_template: Record<string, unknown>;
  creator_timezone: string;
  start_date: string;
  status: "active" | "ended" | "cancelled";
  created_at: string;
};

export type ChallengeMemberRow = {
  challenge_id: string;
  user_id: string;
  habit_id: string;
  role: "creator" | "member";
  joined_at: string;
};

export type ChallengeInviteRow = {
  id: string;
  challenge_id: string;
  inviter_id: string;
  invitee_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type ProfileSearchRow = {
  id: string;
  username: string;
  display_name: string | null;
};

export type ChallengeNudgeKind = "cheer" | "ping" | "fire" | "congrats";

export type ChallengeNudgeRow = {
  id: string;
  challenge_id: string;
  from_user_id: string;
  to_user_id: string;
  kind: ChallengeNudgeKind;
  created_at: string;
};

export type ChallengeActivityKind = "mission_day" | "streak_milestone";

export type ChallengeActivityRow = {
  id: string;
  challenge_id: string;
  actor_user_id: string;
  kind: ChallengeActivityKind;
  value: number;
  created_at: string;
};
