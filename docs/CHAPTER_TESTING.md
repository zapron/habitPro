# Chapters (Video Moments): testing on production

How to turn Chapters on for a tester and give them missions that already have a
Chapter unlocked, so nobody has to wait 7 days. All queries run in the Supabase
SQL Editor of the production project (`glriwmxkpfubbyzoyzdk`). Testers need a
1.1.39+ build and must be premium (`profile_is_premium`).

Rules recap (server: `rpc_claim_video_moment_v1`, client: `src/features/videoMoments/credit.ts`):
a mission earns one Chapter per 7-day week of its own days (7/7 done, no streak
repair, at least 4 Community posts that week), usable from that week's day 7
through day 14. Only missions whose day 1 and server `first_seen_at` are on/after
the tester's `starts_on` count. One Chapter per mission per week: deleting the
post does not give it back. Chapters are recorded with the camera only (5 s max);
picking from the library was removed on 2026-11-07 (see `docs/CURRENT_WORK.md`).

## Testers

Current testers (added 2026-11-06): `raktim_24` (`f90d8ca4-ad7c-4ca8-9646-4633af4a53b3`)
and `zapron` (`e65e9425-e1e5-443e-83d4-be71b8b4d59c`). The global flag
`app_feature_flags.video_moments` is still `enabled = false`.

```sql
-- Add a tester (Chapters on for this user only)
insert into public.app_feature_testers (key, user_id, starts_on)
select 'video_moments', id, (now() at time zone 'Asia/Kolkata')::date
from public.profiles where username = '<username>'
on conflict (key, user_id) do update set starts_on = excluded.starts_on;

-- Remove a tester
delete from public.app_feature_testers
where key = 'video_moments'
  and user_id = (select id from public.profiles where username = '<username>');
```

The app reads flags once per session: close and reopen it after a change.

## 1. Seed test missions (safe to re-run)

For each tester it moves `starts_on` back 12 days, wipes any earlier
`chapter-test-*` missions, their posts (including real Chapter posts) and claims,
then creates:

| Mission | What to test |
|---|---|
| `chapter-test-ready` (day 10) | Chapter 1 unlocked: record and post it |
| `chapter-test-day7` (day 7) | Unlocks on the week's own day 7: check in today with "Record 5s chapter" |
| `chapter-test-day4` (day 4) | Charging row only ("Chapter 1 · 3 days to go"); no video by design |
| `chapter-test-checklist` (day 10) | "Add your Chapter" row in the checklist day sheet |

The seeded day 1-4 posts go into `community_win_moderation` (reason
`test_seed`), so only their author sees them. A Chapter you post yourself is a
normal post that everyone sees; on app versions before 1.1.39 it shows as a still
photo (the poster), never an error.

Side effect: the seeded check-ins count toward this week's leaderboard stats for
these accounts until the missions are deleted.

```sql
do $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_uid uuid;
  r record;
begin
  foreach v_uid in array array['f90d8ca4-ad7c-4ca8-9646-4633af4a53b3','e65e9425-e1e5-443e-83d4-be71b8b4d59c']::uuid[] loop
    update app_feature_testers set starts_on = v_today - 12 where key = 'video_moments' and user_id = v_uid;

    delete from community_wins where user_id = v_uid and mini_mission_id like 'habitwin:chapter-test-%';
    delete from moment_videos where user_id = v_uid and habit_id like 'chapter-test-%';
    delete from habits where user_id = v_uid and id like 'chapter-test-%';

    for r in select * from (values
      ('chapter-test-ready', 'Chapter test · day 10 (unlocked)', 9, 9, false),
      ('chapter-test-day7',  'Chapter test · day 7 (unlocks today)', 6, 6, false),
      ('chapter-test-day4',  'Chapter test · day 4 (charging)', 3, 3, false),
      ('chapter-test-checklist', 'Chapter test · checklist day 10', 9, 9, true)
    ) as m(id, title, ago, done, checklist) loop
      insert into habits (id, user_id, title, mode, start_date, total_days, mission_timezone, visibility,
                          completed_dates, streak, task_checklist, streak_memories)
      values (
        r.id, v_uid, r.title, 'autopilot',
        (v_today - r.ago)::timestamp at time zone 'Asia/Kolkata' + interval '5 minutes',
        21, 'Asia/Kolkata', 'solo',
        (select jsonb_agg(to_char(v_today - r.ago + g, 'YYYY-MM-DD')) from generate_series(0, r.done - 1) g),
        r.done,
        case when r.checklist then '[{"id":"t-run","label":"Run 2 km","order":0},{"id":"t-read","label":"Read 10 pages","order":1}]'::jsonb end,
        (select jsonb_object_agg(to_char(v_today - r.ago + g, 'YYYY-MM-DD'),
                case when r.checklist
                  then jsonb_build_object('createdAt', now(), 'tasks', jsonb_build_array(
                         jsonb_build_object('taskId', 't-run', 'label', 'Run 2 km', 'note', 'Day ' || (g + 1) || ' run',
                                            'proofUrls', '[]'::jsonb, 'loggedAt', now())))
                  else jsonb_build_object('createdAt', now(), 'note', 'Day ' || (g + 1) || ' done') end
                || case when g < 4 then '{"communityPosted": true}'::jsonb else '{}'::jsonb end)
         from generate_series(0, r.done - 1) g)
      );

      -- Days 1-4 posts (needed for the 4-post rule), visible only to the author.
      with ins as (
        insert into community_wins (user_id, mini_mission_id, title, completed_at, memory_note, feed_source, streak_mission_day)
        select v_uid, 'habitwin:' || r.id || ':' || to_char(v_today - r.ago + d - 1, 'YYYY-MM-DD'),
               r.title, (v_today - r.ago + d - 1)::timestamp at time zone 'Asia/Kolkata' + interval '20 hours',
               'Day ' || d || ' done', 'habit_streak', d
        from generate_series(1, least(4, r.done)) d
        returning id
      )
      insert into community_win_moderation (win_id, reason) select id, 'test_seed' from ins;
    end loop;
  end loop;
end $$;
```

To seed someone else, change the UUID array. Then close and reopen the app.

## 2. Check the seed

```sql
select p.username, h.id, jsonb_array_length(h.completed_dates) as done,
       public.video_moment_habit_eligible(h.user_id, h.id) as eligible,
       (select count(*) from community_wins w where w.user_id = h.user_id and w.mini_mission_id like 'habitwin:' || h.id || ':%') as posts,
       (select count(*) from community_wins w join community_win_moderation m on m.win_id = w.id
         where w.user_id = h.user_id and w.mini_mission_id like 'habitwin:' || h.id || ':%') as hidden,
       public.feature_starts_on('video_moments', h.user_id) as starts_on
from habits h join profiles p on p.id = h.user_id
where h.id like 'chapter-test-%'
order by p.username, h.id;
```

Expect 4 rows per tester, `eligible = true`, `posts = hidden` (3 for day4, 4 for
the others), `starts_on` 12 days ago.

## 3. Clean up

```sql
delete from community_wins
where mini_mission_id like 'habitwin:chapter-test-%'
  and user_id in ('f90d8ca4-ad7c-4ca8-9646-4633af4a53b3','e65e9425-e1e5-443e-83d4-be71b8b4d59c');

delete from moment_videos
where habit_id like 'chapter-test-%'
  and user_id in ('f90d8ca4-ad7c-4ca8-9646-4633af4a53b3','e65e9425-e1e5-443e-83d4-be71b8b4d59c');

delete from habits
where id like 'chapter-test-%'
  and user_id in ('f90d8ca4-ad7c-4ca8-9646-4633af4a53b3','e65e9425-e1e5-443e-83d4-be71b8b4d59c');
```

Clip files stay in the `moment-videos` bucket under `<user_id>/chapter-test-*/`;
delete them from the dashboard's Storage page. Re-seeding reuses the same paths
(uploads overwrite), so a phone may briefly show a cached older poster or clip.
