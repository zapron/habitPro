-- Optional light-theme hero image for the force-update card. `image_url`
-- stays the dark (and default) image: older builds only read that column.
alter table public.app_version_releases
  add column if not exists image_url_light text;
