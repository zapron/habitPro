-- Run in Supabase Dashboard → SQL Editor (role: postgres).
--
-- Why not UPDATE cron.job?
-- On hosted Supabase, direct UPDATE/INSERT on cron.job is blocked (SQLSTATE 42501) even as postgres.
-- Use pg_cron's official API: cron.alter_job (see Supabase pg_cron troubleshooting docs).
--
-- Purpose: remove stray tab characters from the process-streak-reminders job command.

SELECT cron.alter_job(jobid, command := replace(command, chr(9), ''))
FROM cron.job
WHERE command LIKE '%process-streak-reminders%';
