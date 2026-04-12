-- Post-mission self-report when the mission window ends without a full grid.

alter table public.habits
  add column if not exists mission_report text null
    check (mission_report is null or mission_report in ('accomplished', 'failed'));

alter table public.habits
  add column if not exists mission_report_at timestamptz null;
