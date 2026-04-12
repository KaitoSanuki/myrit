import { formatDailyPostSummaries, parseStopCommand, sendDiscordMessage } from "@/lib/discord";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dayRange, getLocalDate } from "@/lib/time";
import type { PostRow } from "@/lib/types";

export async function notifyTodayPosts(date = getLocalDate()) {
  const supabase = createSupabaseAdminClient();
  const { start, end } = dayRange(date);

  const { data: posts, error } = await supabase
    .from("posts")
    .select("*, accounts(code,label,strategy)")
    .eq("status", "pending")
    .gte("scheduled_at", start)
    .lt("scheduled_at", end)
    .order("scheduled_at", { ascending: true });

  if (error) throw error;
  if (!posts || posts.length === 0) return { date, notified: 0, skipped: true };

  const { data: batch, error: batchError } = await supabase
    .from("discord_batches")
    .insert({ batch_date: date, status: "sent" })
    .select("id")
    .single();

  if (batchError) throw batchError;

  const items = (posts as PostRow[]).map((post, index) => ({
    batch_id: batch.id,
    post_id: post.id,
    ordinal: index + 1
  }));

  const { error: itemsError } = await supabase.from("discord_batch_items").insert(items);
  if (itemsError) throw itemsError;

  const results = [];
  for (const message of formatDailyPostSummaries(posts as any[])) {
    results.push(await sendDiscordMessage(message));
  }

  const messageIds = results.map((result) => result.messageId).filter(Boolean);
  if (messageIds.length > 0) {
    await supabase.from("discord_batches").update({ discord_message_id: messageIds.join(",") }).eq("id", batch.id);
  }

  return { date, notified: posts.length, discordSkipped: results.every((result) => result.skipped), batchId: batch.id };
}

export async function stopPostFromDiscordCommand(command: string, batchId?: string) {
  const ordinal = parseStopCommand(command);
  if (!ordinal) return { stopped: false, reason: "command did not match stop N" };

  const supabase = createSupabaseAdminClient();
  const batch = await resolveBatchId(batchId);
  if (!batch) return { stopped: false, reason: "batch was not found" };

  const { data: item, error: itemError } = await supabase
    .from("discord_batch_items")
    .select("post_id")
    .eq("batch_id", batch)
    .eq("ordinal", ordinal)
    .maybeSingle();

  if (itemError) throw itemError;
  if (!item) return { stopped: false, reason: `post ${ordinal} was not found in the batch` };

  const { data: updated, error } = await supabase
    .from("posts")
    .update({ status: "stopped", error_message: `Stopped from Discord command: ${command}` })
    .eq("id", item.post_id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!updated) return { stopped: false, reason: "post was already published or stopped", postId: item.post_id, ordinal };

  await sendDiscordMessage(`停止しました: stop ${ordinal}`);
  return { stopped: true, postId: item.post_id, ordinal };
}

async function resolveBatchId(batchId?: string): Promise<string | null> {
  if (batchId) return batchId;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("discord_batches")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}
