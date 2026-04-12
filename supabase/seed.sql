insert into accounts (code, label, strategy, platforms)
values
  ('A', 'ランダム寄り', 'random', array['x'::platform_type, 'threads'::platform_type]),
  ('B', '教育寄り', 'education', array['x'::platform_type, 'threads'::platform_type])
on conflict (code) do update set
  label = excluded.label,
  strategy = excluded.strategy,
  platforms = excluded.platforms,
  active = true;

insert into competitors (account, platform)
values
  ('english_speaking_daily', 'x'),
  ('english_with_examples', 'x'),
  ('toeic_note', 'x'),
  ('eikaiwa_tips', 'x'),
  ('learn_english_jp', 'x'),
  ('english_speaking_daily', 'threads'),
  ('english_with_examples', 'threads'),
  ('toeic_note', 'threads'),
  ('eikaiwa_tips', 'threads'),
  ('learn_english_jp', 'threads')
on conflict (account, platform) do update set
  active = true;
