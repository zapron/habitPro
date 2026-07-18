-- Backfill check-in dates that have saved streak memories but are missing from completed_dates.
-- A streak memory is created only after a check-in, so memory date keys are completion evidence.
update public.habits h
set completed_dates = (
  select coalesce(jsonb_agg(to_jsonb(date_key) order by date_key), '[]'::jsonb)
  from (
    select distinct date_key
    from (
      select jsonb_array_elements_text(coalesce(h.completed_dates, '[]'::jsonb)) as date_key
      union all
      select mem.key as date_key
      from jsonb_each(coalesce(h.streak_memories, '{}'::jsonb)) as mem(key, value)
      where mem.key ~ '^\d{4}-\d{2}-\d{2}$'
    ) all_dates
  ) merged_dates
)
where exists (
  select 1
  from jsonb_each(coalesce(h.streak_memories, '{}'::jsonb)) as mem(key, value)
  where mem.key ~ '^\d{4}-\d{2}-\d{2}$'
    and not (coalesce(h.completed_dates, '[]'::jsonb) ? mem.key)
);
