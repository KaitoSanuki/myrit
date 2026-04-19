create table if not exists reference_screenshots (
  id uuid primary key default gen_random_uuid(),
  platform platform_type not null default 'x',
  source_type text not null default 'dashboard',
  screenshot_data_url text not null,
  status text not null default 'pending',
  account_hint text,
  analysis_error text,
  competitor_post_id uuid references competitor_posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  analyzed_at timestamptz
);

create index if not exists reference_screenshots_status_idx on reference_screenshots(status, created_at);

drop trigger if exists reference_screenshots_set_updated_at on reference_screenshots;
create trigger reference_screenshots_set_updated_at
before update on reference_screenshots
for each row
execute function set_updated_at();
