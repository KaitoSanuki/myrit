import { getOptionalEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Platform } from "@/lib/types";

type ImportedCompetitorPost = {
  competitor: string;
  platform: Platform;
  content: string;
  likes?: number;
  reposts?: number;
  replies?: number;
  posted_at: string;
};

export async function importCompetitorPostsFromEnv() {
  const raw = getOptionalEnv("COMPETITOR_POSTS_JSON");
  if (!raw) return { imported: 0, skipped: true };

  const rows = JSON.parse(raw) as ImportedCompetitorPost[];
  const supabase = createSupabaseAdminClient();
  let imported = 0;

  for (const row of rows) {
    const { data: competitor, error: competitorError } = await supabase
      .from("competitors")
      .upsert(
        {
          account: row.competitor,
          platform: row.platform,
          active: true,
          last_checked: new Date().toISOString()
        },
        { onConflict: "account,platform" }
      )
      .select("id")
      .single();

    if (competitorError) throw competitorError;

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
