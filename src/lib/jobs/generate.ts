import { generatePostsForAccount } from "@/lib/generation";
import { getNumberEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getDailyPostTimes, getLocalDate, scheduleAtForDate } from "@/lib/time";
import type { AccountRow, CompetitorPostRow, Platform } from "@/lib/types";

export async function generateDailyPosts(date = getLocalDate()) {
  const supabase = createSupabaseAdminClient();
  const postTimes = getDailyPostTimes();
  const count = Math.min(getNumberEnv("POSTS_PER_DAY", 5), postTimes.length);

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("*")
    .eq("active", true)
    .order("code", { ascending: true });

  if (accountsError) throw accountsError;

  const { data: competitorPosts, error: competitorError } = await supabase
    .from("competitor_posts")
    .select("id, competitor_id, content, likes, reposts, replies, posted_at, created_at")
    .gte("posted_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .order("likes", { ascending: false })
    .limit(30);

  if (competitorError) throw competitorError;

  const activeAccounts = (accounts || []) as AccountRow[];
  if (activeAccounts.length === 0) {
    return { date, generated: 0, inserted: 0, message: "active accounts were not found" };
  }

  const generatedByAccount = new Map(
    activeAccounts.map((account) => [
      account.id,
      generatePostsForAccount({
        account,
        date,
        count,
        competitorPosts: (competitorPosts || []) as CompetitorPostRow[]
      })
    ])
  );

  const inserts = Array.from({ length: count }, (_, slotIndex) => {
    const account = activeAccounts[slotIndex % activeAccounts.length];
    const accountPostIndex = Math.floor(slotIndex / activeAccounts.length);
    const post = generatedByAccount.get(account.id)?.[accountPostIndex];
    if (!post) return [];

    return normalizePlatforms(account.platforms).map((platform) => ({
      account_id: account.id,
      platform,
      content: post.content,
      scheduled_at: scheduleAtForDate(date, postTimes[slotIndex]),
      status: post.safety_flags.length > 0 ? "stopped" : "pending",
      predicted_score: post.predicted_score,
      safety_flags: post.safety_flags
    }));
  }).flat();

  if (inserts.length === 0) {
    return { date, generated: count, inserted: 0, message: "posts were not generated" };
  }

  const { error } = await supabase
    .from("posts")
    .upsert(inserts, { onConflict: "account_id,platform,scheduled_at", ignoreDuplicates: false });

  if (error) throw error;
  return { date, generated: count, inserted: inserts.length };
}

function normalizePlatforms(platforms: Platform[] | null | undefined): Platform[] {
  if (!platforms || platforms.length === 0) return ["x", "threads"];
  return platforms;
}
