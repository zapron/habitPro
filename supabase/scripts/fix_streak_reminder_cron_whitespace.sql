-- Run in Supabase Dashboard → SQL Editor (role: postgres).
--
-- Why not UPDATE cron.job?
-- On hosted Supabase, direct UPDATE/INSERT on cron.job is blocked (SQLSTATE 42501) even as postgres.
-- Use pg_cron's official API: cron.alter_job (see Supabase pg_cron troubleshooting docs).
--
-- Purpose: fix stray whitespace in the process-streak-reminders job command.
-- We’ve seen both:
-- - tab characters (chr(9))
-- - a leading space before the https URL (e.g. `url:=' https://...'`) which makes net.http_post fail

SELECT cron.alter_job(
  jobid,
  command := regexp_replace(
    replace(command, chr(9), ''),
    $$url:='\s+https://$$,
    $$url:='https://$$
  )
)
FROM cron.job
WHERE command LIKE '%process-streak-reminders%';
