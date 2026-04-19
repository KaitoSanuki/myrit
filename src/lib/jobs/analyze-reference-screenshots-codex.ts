import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getNumberEnv, getOptionalEnv } from "@/lib/env";
import { saveReferencePost } from "@/lib/jobs/reference-posts";
import {
  getPendingReferenceScreenshots,
  markReferenceScreenshotAnalyzed,
  markReferenceScreenshotAnalyzing,
  markReferenceScreenshotFailed
} from "@/lib/jobs/reference-screenshots";
import type { Platform, ReferenceScreenshotRow } from "@/lib/types";

type CodexReferenceAnalysis = {
  account: string;
  platform: Platform;
  content: string;
  reply_content: string;
  structure_notes: string;
  pattern_tags: string[];
  impressions: number;
  likes: number;
  reposts: number;
  replies: number;
  posted_at: string;
  confidence: number;
  needs_review: boolean;
};

export async function analyzeReferenceScreenshotsWithCodex(limit = getNumberEnv("CODEX_REFERENCE_BATCH_LIMIT", 3)) {
  const screenshots = await getPendingReferenceScreenshots(limit);
  let analyzed = 0;
  let failed = 0;
  const results = [];

  for (const screenshot of screenshots) {
    try {
      await markReferenceScreenshotAnalyzing(screenshot.id);
      const analysis = await runCodexReferenceAnalysis(screenshot);

      await saveReferencePost({
        account: analysis.account || screenshot.account_hint || "screenshot_reference",
        platform: analysis.platform || screenshot.platform,
        content: analysis.content,
        reply_content: analysis.reply_content,
        structure_notes: [
          analysis.structure_notes,
          analysis.needs_review ? "Codex注: 数値または本文の一部は目視確認推奨。" : ""
        ].filter(Boolean).join("\n"),
        pattern_tags: normalizeTags(analysis.pattern_tags, analysis),
        screenshot_data_url: screenshot.screenshot_data_url,
        impressions: analysis.impressions,
        likes: analysis.likes,
        reposts: analysis.reposts,
        replies: analysis.replies,
        posted_at: normalizePostedAt(analysis.posted_at, screenshot.created_at),
        source_type: "screenshot"
      });

      await markReferenceScreenshotAnalyzed(screenshot.id);
      analyzed += 1;
      results.push({
        id: screenshot.id,
        status: "analyzed",
        account: analysis.account,
        impressions: analysis.impressions,
        tags: analysis.pattern_tags,
        confidence: analysis.confidence,
        needs_review: analysis.needs_review
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await markReferenceScreenshotFailed(screenshot.id, message);
      results.push({ id: screenshot.id, status: "failed", error: message });
    }
  }

  return { checked: screenshots.length, analyzed, failed, results };
}

async function runCodexReferenceAnalysis(screenshot: ReferenceScreenshotRow): Promise<CodexReferenceAnalysis> {
  const codexBin = getOptionalEnv("CODEX_BIN", "codex");
  const model = getOptionalEnv("CODEX_REFERENCE_MODEL") || getOptionalEnv("CODEX_MODEL");
  const timeout = getNumberEnv("CODEX_REFERENCE_TIMEOUT_MS", getNumberEnv("CODEX_TIMEOUT_MS", 180000));
  const tempDir = await mkdtemp(join(tmpdir(), "myrit-reference-codex-"));
  const outputPath = join(tempDir, "reference.json");
  const imagePath = join(tempDir, `screenshot.${extensionForDataUrl(screenshot.screenshot_data_url)}`);

  try {
    await writeFile(imagePath, bufferFromDataUrl(screenshot.screenshot_data_url));

    const args = [
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--color",
      "never",
      "--image",
      imagePath,
      "--output-schema",
      "schemas/codex-reference-screenshot.schema.json",
      "--output-last-message",
      outputPath
    ];

    if (model) args.push("--model", model);
    args.push("-");

    await runCodexCommand(codexBin, args, buildPrompt(screenshot), timeout);
    const raw = await readFile(outputPath, "utf8");
    return parseCodexReferenceAnalysis(raw);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildPrompt(screenshot: ReferenceScreenshotRow): string {
  return [
    "あなたはSNS投稿の構造分析者です。",
    "添付画像はXまたはThreadsのスクリーンショットです。",
    "画像だけを入力として読み取り、英語学習アカウントの投稿生成に使える参考データをJSONで返してください。",
    "",
    "やること:",
    "- 表示されているアカウントIDを読む。読めない場合は account_hint を使う。",
    "- メイン投稿本文を content に入れる。",
    "- リプ、引用、続き、ランキングの答え、Tier表の上位などが見える場合は reply_content に入れる。",
    "- 表示されているインプレッション、いいね、リポスト、返信数、投稿日を可能な範囲で読む。",
    "- 3.4万、9.6万、1.2万のような表記は整数に変換する。",
    "- クリックやリプ閲覧を誘う構造を structure_notes に説明する。",
    "- 投稿文を丸写しするためではなく、構造・フック・余白・CTAを学ぶための分析にする。",
    "",
    "特に検出したい構造:",
    "- tier: Tier表、ランク表、S/A/B/Cなどの分類",
    "- reply_bait: 答えや上位項目をリプに置いてクリックさせる",
    "- curiosity_gap: 空欄、伏せ字、続き、気になる表現で続きを見たくさせる",
    "- list: ランキング、箇条書き、まとめ",
    "- save_cta: 保存必須、あとで見る、メモ推奨",
    "- question_hook: 読者に考えさせる問い",
    "- authority: データ、研究、経験、実績を使う",
    "- beginner: 初心者向けの安心感",
    "",
    `account_hint: ${screenshot.account_hint || "なし"}`,
    `platform_hint: ${screenshot.platform}`,
    "",
    "注意:",
    "- 読めない数値は0にする。",
    "- 日付が読めない場合は空文字ではなく、スクショ登録日のISO文字列を posted_at に入れる。",
    "- 自信が低い場合は confidence を下げ、needs_review を true にする。",
    "- Markdownや説明文は不要。指定JSONスキーマに一致するJSONだけを返す。"
  ].join("\n");
}

function parseCodexReferenceAnalysis(raw: string): CodexReferenceAnalysis {
  const parsed = JSON.parse(extractJson(raw)) as CodexReferenceAnalysis;
  return {
    ...parsed,
    account: parsed.account?.trim() || "screenshot_reference",
    platform: parsed.platform === "threads" ? "threads" : "x",
    content: parsed.content.trim(),
    reply_content: parsed.reply_content?.trim() || "",
    structure_notes: parsed.structure_notes.trim(),
    pattern_tags: normalizeTags(parsed.pattern_tags || [], parsed),
    impressions: normalizeMetric(parsed.impressions),
    likes: normalizeMetric(parsed.likes),
    reposts: normalizeMetric(parsed.reposts),
    replies: normalizeMetric(parsed.replies),
    confidence: Number(parsed.confidence || 0),
    needs_review: Boolean(parsed.needs_review)
  };
}

function normalizeTags(tags: string[], analysis: Pick<CodexReferenceAnalysis, "structure_notes" | "reply_content">): string[] {
  const inferred = [...tags];
  const text = `${analysis.structure_notes}\n${analysis.reply_content}`.toLowerCase();
  if (/tier|ティア|s\/a\/b|ランク/.test(text)) inferred.push("tier");
  if (/リプ|返信|reply|答え|続き/.test(text)) inferred.push("reply_bait");
  if (/空欄|伏せ|気になる|クリック|curiosity/.test(text)) inferred.push("curiosity_gap");

  return [...new Set(inferred.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

function normalizeMetric(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function normalizePostedAt(value: string, fallback: string): string {
  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  return fallback;
}

function bufferFromDataUrl(dataUrl: string): Buffer {
  const match = /^data:[^;]+;base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error("Screenshot data URL is invalid");
  return Buffer.from(match[1], "base64");
}

function extensionForDataUrl(dataUrl: string): string {
  if (dataUrl.startsWith("data:image/jpeg")) return "jpg";
  if (dataUrl.startsWith("data:image/webp")) return "webp";
  return "png";
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

function runCodexCommand(command: string, args: string[], input: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Codex CLI timed out after ${timeout}ms\n${stderr || stdout}`));
    }, timeout);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Codex CLI failed with code ${code ?? "null"} signal ${signal ?? "null"}\n${stderr || stdout}`));
    });

    child.stdin.end(input);
  });
}
