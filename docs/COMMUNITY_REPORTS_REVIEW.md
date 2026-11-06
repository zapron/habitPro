# Reviewing Community reports

Reports come from the "⋯ → Report this post" menu on every Community post
in the feed and on a single post's screen (journey-moment)
(`rpc_report_community_win_v1`, migration `20261101120000_community_win_reports.sql`).
Run these in the Supabase SQL editor for the production project.

The website Terms promise: acknowledge within 24 hours, act within 15 days.
Check the queue at least once a day.

## How it works

- One report per person per post; a person can send at most 20 a day.
- Reasons: `copyright`, `inappropriate`, `harassment`, `spam`, `other`.
- The reporter stops seeing the post in their Community feed right away, and
  after a refresh or on another phone (the feed skips posts they reported).
- `community_report_autohide` flag (off by default): when on, a post with 3
  or more different reporters is hidden from everyone except its author until
  you review it. When off, reports are only recorded.
- A hidden post is a row in `community_win_moderation`. Users can't add or
  remove those rows; only you can, from the SQL editor.

## Daily queue

```sql
-- Posts with reports, most reported first, with hide state
select w.id as win_id, w.title, w.user_id as author, w.memory_image_url, w.video_url,
       count(r.*) as reports,
       string_agg(distinct r.reason, ', ') as reasons,
       max(r.created_at) as last_report,
       (m.win_id is not null) as hidden
from public.community_win_reports r
join public.community_wins w on w.id = r.win_id
left join public.community_win_moderation m on m.win_id = w.id
group by w.id, m.win_id
order by reports desc, last_report desc;

-- Details people wrote for one post
select reason, details, created_at from public.community_win_reports
where win_id = '<win_id>' order by created_at;
```

## Decisions

```sql
-- Hide a post now (author still sees it)
insert into public.community_win_moderation (win_id, reason)
values ('<win_id>', 'review') on conflict (win_id) do nothing;

-- Report was wrong: show it again and clear its reports
delete from public.community_win_moderation where win_id = '<win_id>';
delete from public.community_win_reports where win_id = '<win_id>';

-- Remove the post for good (reports and hide go with it)
delete from public.community_wins where id = '<win_id>';
```

A removed chapter's clip stays in the `moment-videos` bucket until deleted from
Storage (path `<author uid>/<habit id>/<week>.mp4` and `.jpg`).

## Turning auto-hide on or off

```sql
update public.app_feature_flags set enabled = true,  updated_at = now() where key = 'community_report_autohide';
update public.app_feature_flags set enabled = false, updated_at = now() where key = 'community_report_autohide';
```

## Copyright notices by email

Requests to habitpro.info@gmail.com with the subject "Takedown request":
reply within 24 hours, find the post (username + date + screenshot), hide it
with the first statement above while you check, then remove it or restore it
within 15 days and reply to both the sender and the author.
