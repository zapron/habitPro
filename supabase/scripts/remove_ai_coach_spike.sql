-- Remove the disposable AI Coach spike.
-- This drops only ai_coach_spike-owned objects created by:
--   20260625141000_ai_coach_spike_isolated_schema.sql

drop function if exists public.ai_coach_spike_record_usage(uuid, text, text, text, integer, integer, text, jsonb);
drop function if exists public.ai_coach_spike_usage_count(uuid, timestamptz);
drop schema if exists ai_spike cascade;

