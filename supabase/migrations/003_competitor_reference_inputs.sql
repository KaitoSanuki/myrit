alter table competitor_posts
  add column if not exists source_type text not null default 'manual',
  add column if not exists screenshot_data_url text,
  add column if not exists reply_content text,
  add column if not exists structure_notes text,
  add column if not exists pattern_tags text[] not null default '{}';
