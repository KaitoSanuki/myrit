create extension if not exists pgcrypto;

do $$
begin
  create type platform_type as enum ('x', 'threads');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type post_status as enum ('pending', 'posted', 'stopped', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type account_strategy as enum ('random', 'education');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type analysis_type as enum ('daily', 'weekly');
exception
  when duplicate_object then null;
end $$;

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  strategy account_strategy not null,
  platforms platform_type[] not null default array['x'::platform_type, 'threads'::platform_type],
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  platform platform_type not null,
  content text not null check (char_length(content) between 1 and 500),
  scheduled_at timestamptz not null,
  status post_status not null default 'pending',
  score numeric not null default 0,
  predicted_score numeric not null default 0,
  safety_flags text[] not null default '{}',
  external_post_id text,
  external_url text,
  posted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, platform, scheduled_at)
);

create index if not exists posts_status_scheduled_at_idx on posts(status, scheduled_at);
create index if not exists posts_account_platform_idx on posts(account_id, platform);

create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  impressions integer not null default 0 check (impressions >= 0),
  likes integer not null default 0 check (likes >= 0),
  reposts integer not null default 0 check (reposts >= 0),
  replies integer not null default 0 check (replies >= 0),
  followers_delta integer not null default 0,
  score numeric generated always as (
    likes * 1
    + reposts * 2
    + replies * 1.5
    + followers_delta * 3
  ) stored,
  collected_at timestamptz not null default now()
);

create index if not exists results_post_collected_idx on results(post_id, collected_at desc);

create table if not exists competitors (
  id uuid primary key default gen_random_uuid(),
  account text not null,
  platform platform_type not null,
  active boolean not null default true,
  last_checked timestamptz,
  created_at timestamptz not null default now(),
  unique (account, platform)
);

create table if not exists competitor_posts (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  external_post_id text,
  external_url text,
  source_type text not null default 'manual',
  screenshot_data_url text,
  content text not null,
  reply_content text,
  structure_notes text,
  pattern_tags text[] not null default '{}',
  impressions integer not null default 0 check (impressions >= 0),
  likes integer not null default 0 check (likes >= 0),
  reposts integer not null default 0 check (reposts >= 0),
  replies integer not null default 0 check (replies >= 0),
  posted_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists competitor_posts_posted_at_idx on competitor_posts(posted_at desc);
create index if not exists competitor_posts_competitor_idx on competitor_posts(competitor_id);
create unique index if not exists competitor_posts_external_post_idx
  on competitor_posts(competitor_id, external_post_id)
  where external_post_id is not null;

create table if not exists analysis (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type analysis_type not null,
  insight text not null,
  action text not null,
  created_at timestamptz not null default now(),
  unique (date, type)
);

create table if not exists discord_batches (
  id uuid primary key default gen_random_uuid(),
  batch_date date not null,
  status text not null default 'sent',
  discord_message_id text,
  created_at timestamptz not null default now()
);

create table if not exists discord_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references discord_batches(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  created_at timestamptz not null default now(),
  unique (batch_id, ordinal),
  unique (batch_id, post_id)
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_set_updated_at on posts;
create trigger posts_set_updated_at
before update on posts
for each row
execute function set_updated_at();
