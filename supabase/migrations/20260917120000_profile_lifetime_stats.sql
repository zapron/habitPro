-- Hot-window plan, Phase A: Profile's "lifetime" stats today are summed by
-- iterating the FULL local habits/mini_missions arrays on every render
-- (profileIntelligence.ts's totalLifetimeCheckIns/maxHabitStreak/
-- countMemoryProofs/countPublicMoments, profile.tsx's missionStats). Once
-- the local array is windowed (a later phase), those numbers would
-- silently under-report. This RPC computes them directly from the
-- database instead, independent of how much history happens to be loaded
-- on the device.
--
-- Deliberately scoped to only the fields that actually need a full-table
-- scan (done/lifetime totals). "Active"/"live" counts are NOT included
-- here — an active habit or an open mini mission is, by definition, always
-- part of the "hot" window this plan will keep loaded, so those stay safe
-- to compute client-side from the local array forever and don't need a
-- server round trip.
--
-- Precision tradeoff (same category already made and approved in Phase 2's
-- rpc_habits_history_page_v1): computed from stored columns/jsonb content
-- directly, not by porting habitFromRow's full client-side derivation
-- (timezone canonicalization, grid-completion math). Two known, accepted
-- approximations:
--   1. lifetimeCheckIns counts raw `completed_dates` entries, not the
--      client's `completedWithMemoryEvidence` (which also folds in a few
--      memory-only completions with no matching completed_dates entry).
--   2. repairs are counted from streak_memories.repairSource only, not
--      also cross-referenced against the separate streak_repairs table
--      (habit.repairedDates client-side) — that second source represents
--      a repair that's been applied server-side but not yet folded back
--      into streak_memories, a small and transient window.
-- Both are documented, rare-drift tradeoffs, not silent bugs.

create or replace function public.rpc_profile_lifetime_stats_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_lifetime_checkins bigint := 0;
  v_max_streak integer := 0;
  v_habits_total bigint := 0;
  v_pub_habits_done bigint := 0;
  v_solo_habits_done bigint := 0;
  v_habit_memory_proofs bigint := 0;
  v_habit_public_moments bigint := 0;
  v_repairs_total bigint := 0;
  v_repairs_squad bigint := 0;
  v_repairs_solo bigint := 0;
  v_minis_total bigint := 0;
  v_pub_mini_done bigint := 0;
  v_solo_mini_done bigint := 0;
  v_pub_mini_total bigint := 0;
  v_solo_mini_total bigint := 0;
  v_mini_memory_proofs bigint := 0;
  v_mini_public_moments bigint := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select
    count(*),
    coalesce(sum(jsonb_array_length(coalesce(h.completed_dates, '[]'::jsonb))), 0),
    coalesce(max(coalesce(h.streak, 0)), 0),
    count(*) filter (where h.visibility = 'public' and h.is_completed),
    count(*) filter (where h.visibility is distinct from 'public' and h.is_completed)
  into v_habits_total, v_lifetime_checkins, v_max_streak, v_pub_habits_done, v_solo_habits_done
  from public.habits h
  where h.user_id = uid;

  select
    coalesce(count(*) filter (
      where nullif(trim(coalesce(mem.value->>'note', '')), '') is not null
         or nullif(trim(coalesce(mem.value->>'imageUri', mem.value->>'imageUrl', '')), '') is not null
    ), 0),
    coalesce(count(*) filter (
      where (mem.value->>'communityPosted') = 'true'
        and coalesce(mem.value->>'communityFeedRevoked', 'false') is distinct from 'true'
    ), 0),
    coalesce(count(*) filter (where mem.value->>'repairSource' is not null), 0),
    coalesce(count(*) filter (where mem.value->>'repairSource' = 'squad'), 0),
    coalesce(count(*) filter (where mem.value->>'repairSource' = 'solo'), 0)
  into v_habit_memory_proofs, v_habit_public_moments, v_repairs_total, v_repairs_squad, v_repairs_solo
  from public.habits h
  cross join lateral jsonb_each(coalesce(h.streak_memories, '{}'::jsonb)) as mem(key, value)
  where h.user_id = uid;

  select
    count(*),
    count(*) filter (where m.visibility = 'public' and m.status = 'completed'),
    count(*) filter (where m.visibility is distinct from 'public' and m.status = 'completed'),
    count(*) filter (where m.visibility = 'public'),
    count(*) filter (where m.visibility is distinct from 'public'),
    coalesce(count(*) filter (
      where nullif(trim(coalesce(m.completion_memory->>'note', '')), '') is not null
         or nullif(trim(coalesce(m.completion_memory->>'imageUri', m.completion_memory->>'imageUrl', '')), '') is not null
    ), 0),
    coalesce(count(*) filter (
      where m.visibility = 'public'
        and m.status = 'completed'
        and coalesce(m.community_feed_revoked, false) = false
        and m.completion_memory is not null
    ), 0)
  into v_minis_total, v_pub_mini_done, v_solo_mini_done, v_pub_mini_total, v_solo_mini_total,
       v_mini_memory_proofs, v_mini_public_moments
  from public.mini_missions m
  where m.user_id = uid;

  return jsonb_build_object(
    'lifetimeCheckIns', v_lifetime_checkins,
    'maxStreak', v_max_streak,
    'memoryProofs', v_habit_memory_proofs + v_mini_memory_proofs,
    'publicMoments', v_habit_public_moments + v_mini_public_moments,
    'repairs', jsonb_build_object('total', v_repairs_total, 'squad', v_repairs_squad, 'solo', v_repairs_solo),
    'habitsTotal', v_habits_total,
    'minisTotal', v_minis_total,
    'pub', jsonb_build_object('habitsDone', v_pub_habits_done, 'miniDone', v_pub_mini_done, 'miniTotal', v_pub_mini_total),
    'solo', jsonb_build_object('habitsDone', v_solo_habits_done, 'miniDone', v_solo_mini_done, 'miniTotal', v_solo_mini_total),
    'serverNow', now()
  );
end;
$$;

grant execute on function public.rpc_profile_lifetime_stats_v1() to authenticated;
