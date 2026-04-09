-- Replace "same" nudge with "ping" (streak check / where are you). Migrates existing rows.

alter table public.challenge_nudges drop constraint if exists challenge_nudges_kind_check;

update public.challenge_nudges
set kind = 'ping'
where kind = 'same';

alter table public.challenge_nudges
  add constraint challenge_nudges_kind_check
  check (kind in ('cheer', 'ping', 'fire', 'congrats'));
