import { getNumberEnv, getRequiredEnv } from "@/lib/env";
import { importCompetitorPosts } from "@/lib/jobs/competitors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type XUser = {
  id: string;
  username: string;
};

type XPost = {
  id: string;
  text: string;
  created_at: string;
  public_metrics?: {
    impression_count?: number;
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
  };
};

type XListResponse<T> = {
  data?: T[];
  meta?: {
    next_token?: string;
  };
  errors?: unknown[];
};

type XSingleResponse<T> = {
  data?: T;
  errors?: unknown[];
};

type RecentXPostsResult = {
  posts: XPost[];
  pagesFetched: number;
};

export async function collectWeeklyTopCompetitorPosts(days = getNumberEnv("COMPETITOR_COLLECT_DAYS", 7)) {
  const supabase = createSupabaseAdminClient();
  const bearerToken = getRequiredEnv("X_BEARER_TOKEN");
  const lookbackDays = normalizePositiveNumber(days, 7);
  const maxPages = normalizePositiveNumber(getNumberEnv("X_COMPETITOR_TIMELINE_MAX_PAGES", 3), 3);
  const maxAccounts = normalizePositiveNumber(getNumberEnv("X_COMPETITOR_MAX_ACCOUNTS", 10), 10);

  const { data: competitors, error } = await supabase
    .from("competitors")
    .select("id, account, platform, active")
    .eq("active", true)
    .eq("platform", "x")
    .order("account", { ascending: true });

  if (error) throw error;

  const targetCompetitors = (competitors || []).slice(0, maxAccounts);
  const results = [];
  let imported = 0;
  let updated = 0;
  let apiRequests = 0;
  let postsSeen = 0;

  for (const competitor of targetCompetitors) {
    let accountApiRequests = 0;
    let countedApiRequests = false;
    try {
      const user = await fetchXUserByUsername(bearerToken, competitor.account);
      accountApiRequests += 1;

      const timeline = await fetchRecentXPosts(bearerToken, user.id, lookbackDays, maxPages);
      accountApiRequests += timeline.pagesFetched;
      apiRequests += accountApiRequests;
      countedApiRequests = true;
      postsSeen += timeline.posts.length;

      const posts = timeline.posts;
      const topPost = chooseTopPostByImpressions(posts);

      if (!topPost) {
        await markCompetitorChecked(supabase, competitor.id);
        results.push({
          account: competitor.account,
          status: "skipped",
          reason: "no posts in range",
          posts_seen: posts.length,
          api_requests: accountApiRequests
        });
        continue;
      }

      const metrics = topPost.public_metrics || {};
      const importResult = await importCompetitorPosts([
        {
          competitor: competitor.account,
          platform: "x",
          external_post_id: topPost.id,
          external_url: `https://x.com/${user.username}/status/${topPost.id}`,
          content: topPost.text,
          impressions: Number(metrics.impression_count || 0),
          likes: Number(metrics.like_count || 0),
          reposts: Number(metrics.retweet_count || 0) + Number(metrics.quote_count || 0),
          replies: Number(metrics.reply_count || 0),
          posted_at: topPost.created_at
        }
      ]);

      imported += importResult.imported;
      updated += importResult.updated;
      results.push({
        account: competitor.account,
        status: importResult.imported > 0 ? "imported" : "updated",
        external_post_id: topPost.id,
        external_url: `https://x.com/${user.username}/status/${topPost.id}`,
        impressions: Number(metrics.impression_count || 0),
        likes: Number(metrics.like_count || 0),
        reposts: Number(metrics.retweet_count || 0) + Number(metrics.quote_count || 0),
        replies: Number(metrics.reply_count || 0),
        posts_seen: posts.length,
        api_requests: accountApiRequests
      });
    } catch (error) {
      if (!countedApiRequests) {
        apiRequests += accountApiRequests || 1;
      }
      results.push({
        account: competitor.account,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    checked: targetCompetitors.length,
    total_active_x_competitors: competitors?.length || 0,
    imported,
    updated,
    days: lookbackDays,
    max_accounts: maxAccounts,
    max_pages: maxPages,
    estimated_x_api_requests: apiRequests,
    posts_seen: postsSeen,
    results
  };
}

async function fetchXUserByUsername(bearerToken: string, username: string): Promise<XUser> {
  const cleanUsername = username.trim().replace(/^@/, "");
  const response = await fetchXApi<XSingleResponse<XUser>>(
    bearerToken,
    `https://api.x.com/2/users/by/username/${encodeURIComponent(cleanUsername)}?user.fields=username`
  );

  if (!response.data) {
    throw new Error(`X user was not found: ${cleanUsername}`);
  }

  return response.data;
}

async function fetchRecentXPosts(
  bearerToken: string,
  userId: string,
  days: number,
  maxPages: number
): Promise<RecentXPostsResult> {
  const posts: XPost[] = [];
  let nextToken = "";
  const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let pagesFetched = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`https://api.x.com/2/users/${userId}/tweets`);
    url.searchParams.set("max_results", "100");
    url.searchParams.set("exclude", "retweets,replies");
    url.searchParams.set("start_time", startTime);
    url.searchParams.set("tweet.fields", "created_at,public_metrics");
    if (nextToken) url.searchParams.set("pagination_token", nextToken);

    const response = await fetchXApi<XListResponse<XPost>>(bearerToken, url.toString());
    pagesFetched += 1;
    posts.push(...(response.data || []));
    nextToken = response.meta?.next_token || "";
    if (!nextToken) break;
  }

  return { posts, pagesFetched };
}

function chooseTopPostByImpressions(posts: XPost[]): XPost | null {
  return posts
    .filter((post) => post.public_metrics)
    .sort((a, b) => Number(b.public_metrics?.impression_count || 0) - Number(a.public_metrics?.impression_count || 0))[0] || null;
}

async function fetchXApi<T>(bearerToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearerToken}`
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`X API failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload as T;
}

async function markCompetitorChecked(supabase: any, competitorId: string) {
  const { error } = await supabase
    .from("competitors")
    .update({ last_checked: new Date().toISOString() })
    .eq("id", competitorId);

  if (error) throw error;
}

function normalizePositiveNumber(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}
