-- Captures real schema drift found setting up local dev (2026-09-13): production's
-- actual live schema only has challenge_nudges_custom_note_one_per_day_idx (the
-- "once per UTC day" rule from 20260421120000_custom_note_daily_limit.sql).
-- challenge_nudges_custom_note_once_idx (the "once ever" rule added later by
-- 20260502120000_custom_nudge_premium.sql) does not exist on production at all --
-- confirmed via a direct pg_indexes query. It was evidently dropped directly on
-- production, outside of any migration file, at some point after 20260502120000
-- ran. A from-scratch local replay (which faithfully replays every migration file
-- in order, ending up with the "once ever" index still present) then rejects
-- production's real data, which has many legitimate multiple-custom-notes-per-day
-- rows -- proof the "once per day" rule is what's actually been enforced in
-- practice, not "once ever".
--
-- Safe to push to production: this is a no-op there (the index already doesn't
-- exist), and just brings migration history in line with the real live schema.

drop index if exists public.challenge_nudges_custom_note_once_idx;

-- Same drift, second instance found immediately after fixing the first: production
-- also doesn't have challenge_nudges_one_per_day_idx. 20260427194500_challenge_congrats_unique_per_milestone.sql
-- correctly split it into challenge_nudges_one_per_day_non_congrats_idx +
-- challenge_nudges_congrats_once_per_activity_idx (both confirmed present on
-- production), but 20260502120000_custom_nudge_premium.sql (dated later) recreated
-- the old combined index -- which was then evidently dropped again directly on
-- production, outside any migration file, since it doesn't exist there today.
-- Also a safe no-op to push.

drop index if exists public.challenge_nudges_one_per_day_idx;

-- Third instance, different shape: production's actual streak_reminder_log_reminder_kind_check
-- currently allows ('slot_open', 'slot_closing', 'custom_time', 'debug_10m') --
-- confirmed via pg_get_constraintdef. The migration file history disagrees with
-- itself here (20260423131000 adds 'custom_time', 20260426120000 and
-- 20260617124000 both later redefine the constraint without it), and production
-- must have had 'custom_time' re-added directly at some point after 20260617124000,
-- untracked. Reasserting the real, current, live definition here as the final
-- word, applied after every other migration touching this constraint, so a
-- from-scratch replay ends up matching production regardless of that tangled
-- history. Safe to push: production already has this exact constraint, so this
-- is a no-op there (drop-if-exists + recreate the identical definition).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'streak_reminder_log' and column_name = 'reminder_kind'
  ) then
    alter table public.streak_reminder_log drop constraint if exists streak_reminder_log_reminder_kind_check;

    alter table public.streak_reminder_log
      add constraint streak_reminder_log_reminder_kind_check
      check (reminder_kind in ('slot_open', 'slot_closing', 'custom_time', 'debug_10m'));
  end if;
end $$;
