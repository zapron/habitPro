-- When a cohort member’s habit row gains new completed_dates, notify all other squad members.
-- Fires on Supabase upsert (server truth) so offline-first sync still delivers notifications.

create or replace function public.tg_habits_notify_challenge_squad_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge uuid;
  v_old jsonb;
  nd text;
  r record;
  actor_uname text;
begin
  v_challenge := NEW.challenge_group_id;
  if v_challenge is null then
    return NEW;
  end if;

  if not exists (
    select 1 from public.challenge_members m
    where m.challenge_id = v_challenge and m.user_id = NEW.user_id
  ) then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    v_old := '[]'::jsonb;
  elsif TG_OP = 'UPDATE' then
    v_old := coalesce(OLD.completed_dates, '[]'::jsonb);
    if OLD.completed_dates is not distinct from NEW.completed_dates then
      return NEW;
    end if;
  else
    return NEW;
  end if;

  select lower(trim(p.username::text))
  into actor_uname
  from public.profiles p
  where p.id = NEW.user_id;

  if actor_uname is not null and length(actor_uname) = 0 then
    actor_uname := null;
  end if;

  -- One notification batch per newly added calendar day (usually one per check-in).
  for nd in
    select new_only.val
    from (
      select jsonb_array_elements_text(coalesce(NEW.completed_dates, '[]'::jsonb)) as val
      except
      select jsonb_array_elements_text(coalesce(v_old, '[]'::jsonb))
    ) as new_only(val)
  loop
    for r in
      select m.user_id
      from public.challenge_members m
      where m.challenge_id = v_challenge
        and m.user_id is distinct from NEW.user_id
    loop
      insert into public.notifications (user_id, type, payload)
      values (
        r.user_id,
        'challenge_squad_checkin',
        jsonb_build_object(
          'schema', 'habitpro.notification.v1',
          'challenge_id', v_challenge,
          'actor_user_id', NEW.user_id,
          'actor_username', actor_uname,
          'habit_title', NEW.title,
          'date_str', nd
        )
      );
    end loop;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists trg_habits_squad_checkin_ins on public.habits;
create trigger trg_habits_squad_checkin_ins
  after insert on public.habits
  for each row
  when (NEW.challenge_group_id is not null)
  execute procedure public.tg_habits_notify_challenge_squad_checkin();

drop trigger if exists trg_habits_squad_checkin_upd on public.habits;
create trigger trg_habits_squad_checkin_upd
  after update of completed_dates on public.habits
  for each row
  when (NEW.challenge_group_id is not null)
  execute procedure public.tg_habits_notify_challenge_squad_checkin();
