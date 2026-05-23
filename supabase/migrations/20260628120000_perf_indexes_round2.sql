-- Performance indexes: round 2
-- All indexes use IF NOT EXISTS — safe to apply on any environment.

-- Leaderboard: sort profiles by xp
CREATE INDEX IF NOT EXISTS profiles_xp_desc_idx
  ON public.profiles (xp DESC NULLS LAST, id)
  WHERE username IS NOT NULL;

-- Community feed: per-user win history (used by player profile drawer)
CREATE INDEX IF NOT EXISTS community_wins_user_created_idx
  ON public.community_wins (user_id, created_at DESC);

-- Challenges: challenge_id FK lookup (used in RLS policies and joins)
CREATE INDEX IF NOT EXISTS challenge_members_challenge_id_idx
  ON public.challenge_members (challenge_id);

-- Streak repairs: status filtering for pending/applied queries
CREATE INDEX IF NOT EXISTS streak_repairs_user_status_idx
  ON public.streak_repairs (user_id, status, created_at DESC);

-- Notifications: read-status filtering alongside pagination
CREATE INDEX IF NOT EXISTS notifications_user_read_idx
  ON public.notifications (user_id, read_at, created_at DESC);

-- Mini missions: pagination by creation time
CREATE INDEX IF NOT EXISTS mini_missions_user_created_idx
  ON public.mini_missions (user_id, created_at DESC);

-- Challenge invites: lookup by challenge (currently only indexed by invitee)
CREATE INDEX IF NOT EXISTS challenge_invites_challenge_id_idx
  ON public.challenge_invites (challenge_id);

-- Challenge activity: actor-scoped queries (milestones by user)
CREATE INDEX IF NOT EXISTS challenge_activity_actor_idx
  ON public.challenge_activity (actor_user_id, challenge_id, created_at DESC);

-- Streak reminder log: date-range queries per user
CREATE INDEX IF NOT EXISTS streak_reminder_log_user_date_idx
  ON public.streak_reminder_log (user_id, reminder_date);

-- Challenge groups: active-only partial index for status filtering
CREATE INDEX IF NOT EXISTS challenge_groups_status_created_idx
  ON public.challenge_groups (status, created_at DESC)
  WHERE status = 'active';
