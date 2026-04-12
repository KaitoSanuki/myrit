import { getNumberEnv } from "@/lib/env";
import { getPoster } from "@/lib/posting/adapters";
import { calculateActualScore } from "@/lib/scoring";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { KpiMetrics, PostRow } from "@/lib/types";

export async function collectPostKpis(now = new Date()) {
  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const recentCollectionCutoff = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const limit = getNumberEnv("KPI_COLLECTION_LIMIT", 30);

  const { data: posts, error } = await supabase
    .from("posts")
    .select("*")
    .eq("status", "posted")
    .lte("scheduled_at", cutoff)
    .not("external_post_id", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!posts || posts.length === 0) return { collected: 0 };

  let collected = 0;

  for (const post of posts as PostRow[]) {
    const { data: recent, error: recentError } = await supabase
      .from("results")
      .select("id")
      .eq("post_id", post.id)
      .gte("collected_at", recentCollectionCutoff)
      .limit(1)
      .maybeSingle();

    if (recentError) throw recentError;
    if (recent) continue;

    const metrics = await getPoster(post.platform).collectKpis(post);
    const score = calculateActualScore(metrics);
    await insertResult(supabase, post.id, metrics);
    const { error: updateError } = await supabase.from("posts").update({ score }).eq("id", post.id);
    if (updateError) throw updateError;
    collected += 1;
  }

  return { collected };
}

async function insertResult(supabase: any, postId: string, metrics: KpiMetrics) {
  const { error } = await supabase.from("results").insert({
    post_id: postId,
    impressions: metrics.impressions,
    likes: metrics.likes,
    reposts: metrics.reposts,
    replies: metrics.replies,
    followers_delta: metrics.followers_delta
  });

  if (error) throw error;
}
