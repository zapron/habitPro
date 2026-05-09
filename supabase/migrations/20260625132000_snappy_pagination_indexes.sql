create index if not exists idx_notifications_user_created_id
  on public.notifications (user_id, created_at desc, id desc);

create index if not exists idx_challenge_invites_invitee_created_id
  on public.challenge_invites (invitee_id, created_at desc, id desc);

create index if not exists idx_live_mini_participants_user_role_created_id
  on public.live_mini_participants (user_id, role, created_at desc, id desc);

create index if not exists idx_challenge_activity_challenge_created_id
  on public.challenge_activity (challenge_id, created_at desc, id desc);

create index if not exists idx_challenge_nudges_challenge_created_id
  on public.challenge_nudges (challenge_id, created_at desc, id desc);

create index if not exists idx_streak_repairs_challenge_created_id
  on public.streak_repairs (challenge_id, created_at desc, id desc);

