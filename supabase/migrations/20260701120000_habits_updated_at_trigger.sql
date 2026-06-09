-- Keep habits.updated_at current so focus-delta refreshes do not miss habit edits.

create or replace function public._hp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_habits_updated_at on public.habits;
create trigger trg_habits_updated_at
  before update on public.habits
  for each row
  execute function public._hp_touch_updated_at();
