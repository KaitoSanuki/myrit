import { getOptionalEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Platform } from "@/lib/types";

export type ImportedCompetitorPost = {
  competitor: string;
  platform: Platform;
  content: string;
  likes?: number;
  reposts?: number;
  replies?: number;
  posted_at: string;
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

export async function importCompetitorPosts(rows: ImportedCompetitorPost[]) {
  const supabase = createSupabaseAdminClient();
  let imported = 0;

  for (const row of rows) {
    const competitor = await upsertCompetitor(row.competitor, row.platform);

    const { error } = await supabase.from("competitor_posts").insert({
      competitor_id: competitor.id,
      content: row.content,
      likes: row.likes || 0,
      reposts: row.reposts || 0,
      replies: row.replies || 0,
      posted_at: row.posted_at
    });

    if (error) throw error;
    imported += 1;
  }

  return { imported, skipped: false };
}

export async function importCompetitorPostsFromEnv() {
  const raw = getOptionalEnv("COMPETITOR_POSTS_JSON");
  if (!raw) return { imported: 0, skipped: true };

  return importCompetitorPosts(JSON.parse(raw) as ImportedCompetitorPost[]);
}

function normalizeAccount(account: string): string {
  return account.trim().replace(/^@/, "");
}
