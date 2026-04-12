import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dayRange, getLocalDate, getPreviousLocalDate } from "@/lib/time";

export async function analyzeDailyResults(date = getPreviousLocalDate()) {
  const supabase = createSupabaseAdminClient();
  const { start, end } = dayRange(date);

  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, content, platform, scheduled_at, score, predicted_score, status")
    .gte("scheduled_at", start)
    .lt("scheduled_at", end)
    .order("score", { ascending: false });

  if (error) throw error;

  const rows = posts || [];
  const insight = buildInsight(rows);
  const action = buildDailyAction(rows);

  const { error: upsertError } = await supabase.from("analysis").upsert(
    {
      date,
      type: "daily",
      insight,
      action
    },
    { onConflict: "date,type" }
  );

  if (upsertError) throw upsertError;
  return { date, analyzed: rows.length, insight, action };
}

export async function analyzeWeeklyCompetitors(date = getLocalDate()) {
  const supabase = createSupabaseAdminClient();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: posts, error } = await supabase
    .from("competitor_posts")
    .select("content, likes, reposts, replies, posted_at, competitors(account, platform)")
    .gte("posted_at", since)
    .order("likes", { ascending: false })
    .limit(50);

  if (error) throw error;

  const rows = posts || [];
  const top = rows.slice(0, 5).map((post: any) => post.content);
  const insight = [
    `競合投稿 ${rows.length} 件を確認。`,
    top.length > 0 ? `上位テーマ: ${extractPatterns(top).join(" / ") || "まだ明確な偏りなし"}` : "競合投稿が未取得です。",
    "勝ちパターンは短い型、日常例、初心者向けの安心感を優先します。"
  ].join("\n");
  const action = top.length > 0
    ? "来週は上位テーマを2本だけ混ぜ、Aはランダム表現、Bは型解説に寄せて比較します。"
    : "COMPETITOR_POSTS_JSON かスクレイパー連携で競合投稿を追加し、週次分析を再実行します。";

  const { error: upsertError } = await supabase.from("analysis").upsert(
    {
      date,
      type: "weekly",
      insight,
      action
    },
    { onConflict: "date,type" }
  );

  if (upsertError) throw upsertError;
  return { date, analyzed: rows.length, insight, action };
}

function buildInsight(rows: any[]): string {
  if (rows.length === 0) return "対象日の投稿がまだありません。";

  const top = rows.slice(0, 3);
  const bottom = rows.slice(-3);
  return [
    `投稿 ${rows.length} 件を確認。`,
    `上位: ${top.map((post) => short(post.content)).join(" / ")}`,
    `下位: ${bottom.map((post) => short(post.content)).join(" / ")}`,
    `反応が良い候補: ${extractPatterns(top.map((post) => post.content)).join(" / ") || "継続観察"}`
  ].join("\n");
}

function buildDailyAction(rows: any[]): string {
  if (rows.length === 0) return "投稿生成とKPI取得を先に実行します。";

  const top = rows.slice(0, 3).map((post) => post.content);
  const patterns = extractPatterns(top);
  if (patterns.length === 0) return "明日は同じ投稿本数で継続し、CTAあり/なしを比較します。";

  return `明日は ${patterns.slice(0, 2).join(" と ")} を含む投稿を増やし、強い断定は避けます。`;
}

function extractPatterns(contents: string[]): string[] {
  const patterns = new Set<string>();
  for (const content of contents) {
    if (/初心者|beginner/i.test(content)) patterns.add("初心者向け");
    if (/型|フレーズ|phrase/i.test(content)) patterns.add("短い型");
    if (/声に出|発音|リズム/i.test(content)) patterns.add("音読");
    if (/日記|生活|通勤|買い物/i.test(content)) patterns.add("日常例");
    if (/保存|メモ|試して/i.test(content)) patterns.add("軽いCTA");
  }
  return [...patterns];
}

function short(content: string): string {
  return content.replace(/\s+/g, " ").slice(0, 36);
}
