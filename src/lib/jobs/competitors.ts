import { getOptionalEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Platform } from "@/lib/types";

export type ImportedCompetitorPost = {
  competitor: string;
  platform: Platform;
  external_post_id?: string;
  external_url?: string;
  source_type?: "manual" | "screenshot" | "x_api" | "discord";
  screenshot_data_url?: string;
  content: string;
  reply_content?: string;
  structure_notes?: string;
  pattern_tags?: string[];
  impressions?: number;
  likes?: number;
  reposts?: number;
  replies?: number;
  posted_at: string;
};

export type ImportCompetitorPostsResult = {
  imported: number;
  updated: number;
  skipped: boolean;
};

export async function upsertCompetitor(account: string, platform: Platform) {
  const supabase = createSupabaseAdminClient();
  const normalizedAccount = normalizeAccount(account);

  const { data, error } = await supabase
    .from("competitors")
    .upsert(
      {
        account: normalizedAccount,
        platform,
        active: true,
        last_checked: new Date().toISOString()
      },
      { onConflict: "account,platform" }
    )
    .select("id, account, platform, active")
    .single();

  if (error) throw error;
  return data;
}

export async function importCompetitorPosts(rows: ImportedCompetitorPost[]): Promise<ImportCompetitorPostsResult> {
  const supabase = createSupabaseAdminClient();
  let imported = 0;
  let updated = 0;

  for (const row of rows) {
    const competitor = await upsertCompetitor(row.competitor, row.platform);
    const result = await upsertCompetitorPost(supabase, competitor.id, row);
    if (result === "inserted") imported += 1;
    if (result === "updated") updated += 1;
  }

  return { imported, updated, skipped: false };
}

export async function importCompetitorPostsFromEnv() {
  const raw = getOptionalEnv("COMPETITOR_POSTS_JSON");
  if (!raw) return { imported: 0, updated: 0, skipped: true };

  return importCompetitorPosts(JSON.parse(raw) as ImportedCompetitorPost[]);
}

function normalizeAccount(account: string): string {
  return account.trim().replace(/^@/, "");
}

async function upsertCompetitorPost(
  supabase: any,
  competitorId: string,
  row: ImportedCompetitorPost
): Promise<"inserted" | "updated" | "skipped"> {
  const basePayload = {
    competitor_id: competitorId,
    content: row.content,
    likes: row.likes || 0,
    reposts: row.reposts || 0,
    replies: row.replies || 0,
    posted_at: row.posted_at
  };
  const metricsPayload = {
    ...basePayload,
    external_post_id: row.external_post_id || null,
    external_url: row.external_url || null,
    impressions: row.impressions || 0
  };
  const payload = {
    ...metricsPayload,
    source_type: row.source_type || "manual",
    screenshot_data_url: row.screenshot_data_url || null,
    reply_content: cleanOptionalText(row.reply_content),
    structure_notes: cleanOptionalText(row.structure_notes),
    pattern_tags: row.pattern_tags || []
  };

  const duplicateId = await findDuplicateCompetitorPostId(supabase, competitorId, row);
  if (duplicateId) {
    await writeCompetitorPost(supabase, "update", payload, metricsPayload, basePayload, duplicateId);
    return "updated";
  }

  return writeCompetitorPost(supabase, "insert", payload, metricsPayload, basePayload);
}

async function writeCompetitorPost(
  supabase: any,
  mode: "insert" | "update",
  payload: Record<string, unknown>,
  metricsPayload: Record<string, unknown>,
  basePayload: Record<string, unknown>,
  id?: string
): Promise<"inserted" | "updated" | "skipped"> {
  const full = mode === "insert"
    ? await supabase.from("competitor_posts").insert(payload)
    : await supabase.from("competitor_posts").update(payload).eq("id", id);

  if (!full.error) return mode === "insert" ? "inserted" : "updated";
  if (isDuplicateError(full.error)) return "skipped";
  if (!isMissingColumnError(full.error)) throw full.error;

  const metrics = mode === "insert"
    ? await supabase.from("competitor_posts").insert(metricsPayload)
    : await supabase.from("competitor_posts").update(metricsPayload).eq("id", id);

  if (!metrics.error) return mode === "insert" ? "inserted" : "updated";
  if (isDuplicateError(metrics.error)) return "skipped";
  if (!isMissingColumnError(metrics.error)) throw metrics.error;

  const fallback = mode === "insert"
    ? await supabase.from("competitor_posts").insert(basePayload)
    : await supabase.from("competitor_posts").update(basePayload).eq("id", id);

  if (fallback.error) throw fallback.error;
  return mode === "insert" ? "inserted" : "updated";
}

async function findDuplicateCompetitorPostId(
  supabase: any,
  competitorId: string,
  row: ImportedCompetitorPost
): Promise<string | null> {
  if (row.external_post_id) {
    const { data, error } = await supabase
      .from("competitor_posts")
      .select("id")
      .eq("competitor_id", competitorId)
      .eq("external_post_id", row.external_post_id)
      .limit(1)
      .maybeSingle();

    if (!error && data) return data.id;
  }

  const { data, error } = await supabase
    .from("competitor_posts")
    .select("id")
    .eq("competitor_id", competitorId)
    .eq("posted_at", row.posted_at)
    .eq("content", row.content)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data?.id || null;
}

function isMissingColumnError(error: any): boolean {
  return error?.code === "PGRST204" || /column .* does not exist|Could not find .* column/i.test(error?.message || "");
}

function isDuplicateError(error: any): boolean {
  return error?.code === "23505" || /duplicate key/i.test(error?.message || "");
}

function cleanOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() || "";
  return trimmed || null;
}
