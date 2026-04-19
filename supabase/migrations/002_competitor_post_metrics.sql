alter table competitor_posts
  add column if not exists external_post_id text,
  add column if not exists external_url text,
  add column if not exists impressions integer not null default 0 check (impressions >= 0);

create unique index if not exists competitor_posts_external_post_idx
  on competitor_posts(competitor_id, external_post_id)
  where external_post_id is not null;
