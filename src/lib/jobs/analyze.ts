import { getNumberEnv } from "@/lib/env";
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
  const lookbackDays = getNumberEnv("COMPETITOR_LOOKBACK_DAYS", 3650);
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: posts, error } = await supabase
    .from("competitor_posts")
    .select("content, reply_content, structure_notes, pattern_tags, impressions, likes, reposts, replies, posted_at, competitors(account, platform)")
    .gte("posted_at", since)
    .order("impressions", { ascending: false })
    .limit(50);

  if (error) throw error;

  const rows = posts || [];
  const ranked = rows
    .slice()
    .sort((a: any, b: any) => competitorScore(b) - competitorScore(a));
  const top = ranked.slice(0, 5);
  const bottom = ranked.slice(-5).reverse();
  const topContents = top.map((post: any) => referenceText(post));
  const bottomContents = bottom.map((post: any) => referenceText(post));
  const winningPatterns = extractPatterns(topContents);
  const losingPatterns = inferLosingPatterns(bottomContents, winningPatterns);

  const insight = [
    `競合投稿 ${rows.length} 件を確認。`,
    top.length > 0 ? `勝ちパターン: ${winningPatterns.join(" / ") || "まだ明確な偏りなし"}` : "競合投稿が未取得です。",
    bottom.length > 0 ? `負けパターン候補: ${losingPatterns.join(" / ") || "継続観察"}` : "下位投稿はまだ比較できません。",
    top.length > 0 ? `上位投稿例: ${top.map((post: any) => `${short(post.content)}（imp ${Number(post.impressions || 0).toLocaleString("ja-JP")}）`).join(" / ")}` : ""
  ].filter(Boolean).join("\n");

  const action = top.length > 0
    ? [
        "次の仮説:",
        `Aは ${pickOrDefault(winningPatterns, "日常例")} を自然な一文紹介として増やす。`,
        `Bは ${pickOrDefault(winningPatterns.filter((pattern) => pattern !== "日常例"), "短い型")} を手順や例文つきで出す。`,
        "共通で、断定・煽り・長すぎる説明を避ける。"
      ].join("\n")
    : "競合投稿を追加し、週次分析を再実行します。";

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

export async function getRecentAnalysisForGeneration(limit = 4): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("analysis")
    .select("date, type, insight, action")
    .order("date", { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!data || data.length === 0) return "";

  return data
    .map((item: any) => [`${item.date} / ${item.type}`, item.insight, item.action].join("\n"))
    .join("\n\n");
}

function competitorScore(post: any): number {
  const impressions = Number(post.impressions || 0);
  const engagement = Number(post.likes || 0) + Number(post.reposts || 0) * 2 + Number(post.replies || 0) * 1.5;
  return impressions > 0 ? impressions : engagement;
}

function inferLosingPatterns(contents: string[], winningPatterns: string[]): string[] {
  const patterns = new Set<string>();

  for (const content of contents) {
    if ([...content].length > 220) patterns.add("長すぎる説明");
    if (!/[。.!?？]/.test(content)) patterns.add("読み切りにくい文");
    if (/絶対|必ず|今すぐ|知らないと損|まだ.*してない/.test(content)) patterns.add("強い断定や煽り");
  }

  if (winningPatterns.length > 0 && patterns.size === 0) {
    patterns.add("勝ちパターンとの差分を継続観察");
  }

  return [...patterns];
}

function referenceText(post: any): string {
  return [post.content, post.reply_content, post.structure_notes, ...(post.pattern_tags || [])]
    .filter(Boolean)
    .join("\n");
}

function pickOrDefault(items: string[], fallback: string): string {
  return items[0] || fallback;
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
    if (/tier|ティア|ランク|ランキング|S[：:]|A[：:]|B[：:]/i.test(content)) patterns.add("Tier/ランキング構造");
    if (/リプ|返信|続き|答え|空欄|クリック|curiosity_gap|reply_bait/i.test(content)) patterns.add("リプ誘導");
  }
  return [...patterns];
}

function short(content: string): string {
  return content.replace(/\s+/g, " ").slice(0, 36);
}
