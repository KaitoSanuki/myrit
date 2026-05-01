import { sendDiscordMessage } from "@/lib/discord";
import { getNumberEnv } from "@/lib/env";
import { getPoster } from "@/lib/posting/adapters";
import { describeSafetyFlags, detectDangerousContent } from "@/lib/safety";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Platform, PostRow } from "@/lib/types";

type PublishOptions = {
  now?: Date;
  limit?: number;
  platform?: Platform;
  postId?: string;
  ignoreSchedule?: boolean;
};

export async function publishDuePosts(options: PublishOptions = {}) {
  const supabase = createSupabaseAdminClient();
  const now = options.now || new Date();
  const limit = options.limit ?? getNumberEnv("PUBLISH_LIMIT", 20);

  let query = supabase
    .from("posts")
    .select("*")
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (!options.ignoreSchedule) {
    query = query.lte("scheduled_at", now.toISOString());
  }

  if (options.platform) {
    query = query.eq("platform", options.platform);
  }

  if (options.postId) {
    query = query.eq("id", options.postId);
  }

  const { data: posts, error } = await query;

  if (error) throw error;
  if (!posts || posts.length === 0) {
    return {
      published: 0,
      stopped: 0,
      failed: 0,
      checked: 0,
      limit,
      platform: options.platform || null,
      postId: options.postId || null,
      ignoreSchedule: Boolean(options.ignoreSchedule)
    };
  }

  let published = 0;
  let stopped = 0;
  let failed = 0;

  for (const post of posts as PostRow[]) {
    const safetyFlags = detectDangerousContent(post.content);
    if (safetyFlags.length > 0) {
      await supabase
        .from("posts")
        .update({
          status: "stopped",
          safety_flags: safetyFlags,
          error_message: `Auto stopped: ${describeSafetyFlags(safetyFlags)}`
        })
        .eq("id", post.id);
      stopped += 1;
      continue;
    }

    try {
      const result = await getPoster(post.platform).publish(post);
      await supabase
        .from("posts")
        .update({
          status: "posted",
          external_post_id: result.externalId,
          external_url: result.externalUrl || null,
          posted_at: new Date().toISOString(),
          error_message: null
        })
        .eq("id", post.id);
      published += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await supabase.from("posts").update({ status: "failed", error_message: message }).eq("id", post.id);
      await sendDiscordMessage(`投稿に失敗しました: ${post.platform.toUpperCase()}\n${message}`);
    }
  }

  return {
    published,
    stopped,
    failed,
    checked: posts.length,
    limit,
    platform: options.platform || null,
    postId: options.postId || null,
    ignoreSchedule: Boolean(options.ignoreSchedule)
  };
}
