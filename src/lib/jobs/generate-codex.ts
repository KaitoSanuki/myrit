import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getNumberEnv, getOptionalEnv } from "@/lib/env";
import { detectDangerousContent } from "@/lib/safety";
import { predictPostScore } from "@/lib/scoring";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getDailyPostTimes, getLocalDate, scheduleAtForDate } from "@/lib/time";
import type { AccountRow, CompetitorPostRow, Platform } from "@/lib/types";

const execFileAsync = promisify(execFile);

type CodexPost = {
  slot: number;
  content: string;
};

type CodexOutput = {
  posts: CodexPost[];
};

type Slot = {
  slot: number;
  time: string;
  account: AccountRow;
};

export async function generateDailyPostsWithCodex(date = getLocalDate()) {
  const supabase = createSupabaseAdminClient();
  const postTimes = getDailyPostTimes();
  const count = Math.min(getNumberEnv("POSTS_PER_DAY", 5), postTimes.length);

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("*")
    .eq("active", true)
    .order("code", { ascending: true });

  if (accountsError) throw accountsError;

  const activeAccounts = (accounts || []) as AccountRow[];
  if (activeAccounts.length === 0) {
    return { date, generated: 0, inserted: 0, message: "active accounts were not found" };
  }

  const { data: competitorPosts, error: competitorError } = await supabase
    .from("competitor_posts")
    .select("id, competitor_id, content, likes, reposts, replies, posted_at, created_at")
    .gte("posted_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .order("likes", { ascending: false })
    .limit(20);

  if (competitorError) throw competitorError;

  const slots = buildSlots(activeAccounts, postTimes, count);
  const codexPosts = await runCodexGenerator(slots, (competitorPosts || []) as CompetitorPostRow[], date);
  const postsBySlot = new Map(codexPosts.posts.map((post) => [post.slot, post.content.trim()]));

  const inserts = slots.flatMap((slot) => {
    const content = postsBySlot.get(slot.slot);
    if (!content) return [];

    const safetyFlags = detectDangerousContent(content);
    return normalizePlatforms(slot.account.platforms).map((platform) => ({
      account_id: slot.account.id,
      platform,
      content,
      scheduled_at: scheduleAtForDate(date, slot.time),
      status: safetyFlags.length > 0 ? "stopped" : "pending",
      predicted_score: predictPostScore(content, slot.account.strategy),
      safety_flags: safetyFlags
    }));
  });

  if (inserts.length === 0) {
    return { date, generated: count, inserted: 0, message: "Codex did not return usable posts" };
  }

  const { error } = await supabase
    .from("posts")
    .upsert(inserts, { onConflict: "account_id,platform,scheduled_at", ignoreDuplicates: false });

  if (error) throw error;
  return { date, generated: slots.length, inserted: inserts.length, provider: "codex-cli" };
}

function buildSlots(accounts: AccountRow[], postTimes: string[], count: number): Slot[] {
  return Array.from({ length: count }, (_, index) => ({
    slot: index + 1,
    time: postTimes[index],
    account: accounts[index % accounts.length]
  }));
}

async function runCodexGenerator(slots: Slot[], competitorPosts: CompetitorPostRow[], date: string): Promise<CodexOutput> {
  const codexBin = getOptionalEnv("CODEX_BIN", "codex");
  const model = getOptionalEnv("CODEX_MODEL");
  const timeout = getNumberEnv("CODEX_TIMEOUT_MS", 180000);
  const tempDir = await mkdtemp(join(tmpdir(), "myrit-codex-"));
  const outputPath = join(tempDir, "posts.json");

  try {
    const args = [
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--color",
      "never",
      "--output-schema",
      "schemas/codex-posts.schema.json",
      "--output-last-message",
      outputPath
    ];

    if (model) args.push("--model", model);
    args.push(buildPrompt(slots, competitorPosts, date));

    await execFileAsync(codexBin, args, {
      cwd: process.cwd(),
      timeout,
      maxBuffer: 1024 * 1024
    });

    const raw = await readFile(outputPath, "utf8");
    return parseCodexOutput(raw);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildPrompt(slots: Slot[], competitorPosts: CompetitorPostRow[], date: string): string {
  const slotLines = slots
    .map((slot) => `${slot.slot}. ${slot.time} / account ${slot.account.code} / strategy ${slot.account.strategy}`)
    .join("\n");
  const competitorLines = competitorPosts
    .slice(0, 10)
    .map((post, index) => `${index + 1}. likes ${post.likes}, reposts ${post.reposts}, replies ${post.replies}: ${post.content}`)
    .join("\n");

  return [
    "あなたは英語学習アカウントの投稿編集者です。",
    "初心者にもわかりやすく、偉そうにせず、煽りすぎない投稿文を作ってください。",
    "政治、差別、不確実な断定、強い煽りは避けてください。",
    "XとThreadsで共通利用するため、各投稿は280文字以内にしてください。",
    "説明文やMarkdownは不要です。指定JSONスキーマに一致するJSONだけを最終回答にしてください。",
    "",
    `生成日: ${date}`,
    "投稿枠:",
    slotLines,
    "",
    "戦略:",
    "- random: 少し意外性や日常感を出す。ただし雑にしない。",
    "- education: 型、例、手順を入れて学習価値を出す。",
    "",
    "参考競合投稿:",
    competitorLines || "なし",
    "",
    "返すJSON:",
    '{"posts":[{"slot":1,"content":"投稿文"}]}',
    `postsは必ず${slots.length}件、slotは1から${slots.length}まで重複なし。`
  ].join("\n");
}

function parseCodexOutput(raw: string): CodexOutput {
  const jsonText = extractJson(raw);
  const parsed = JSON.parse(jsonText) as CodexOutput;
  if (!Array.isArray(parsed.posts)) {
    throw new Error(`Codex output did not include posts array: ${raw}`);
  }
  return parsed;
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fenced) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error(`Could not parse Codex JSON output: ${raw}`);
}

function normalizePlatforms(platforms: Platform[] | null | undefined): Platform[] {
  if (!platforms || platforms.length === 0) return ["x", "threads"];
  return platforms;
}
