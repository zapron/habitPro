-- Adds premium force-update screen content to app_version_releases: a hero
-- image, a structured bullet-point changelog, and an optional link to a full
-- changelog page. All nullable/additive — existing rows and the plain-text
-- `notes` column are unaffected.

alter table public.app_version_releases
  add column if not exists image_url text,
  add column if not exists changelog jsonb,
  add column if not exists changelog_url text;

comment on column public.app_version_releases.image_url is
  'Optional hero image shown on the force-update screen for this release (e.g. a release-announcement graphic).';
comment on column public.app_version_releases.changelog is
  'Optional structured changelog: a JSON array of bullet-point strings, e.g. ["Faster load times", "New modes in Mini missions", "UX improvements"]. Falls back to `notes` when null.';
comment on column public.app_version_releases.changelog_url is
  'Optional link to a full changelog / release notes page, shown as "See full changelog" below the bullet list.';
