import { importCompetitorPosts } from "@/lib/jobs/competitors";
import type { Platform } from "@/lib/types";

export type ReferencePostInput = {
  account: string;
  platform: Platform;
  content: string;
  reply_content?: string;
  structure_notes?: string;
  pattern_tags?: string[];
  screenshot_data_url?: string;
  external_url?: string;
  impressions?: number;
  likes?: number;
  reposts?: number;
  replies?: number;
  posted_at?: string;
  source_type?: "manual" | "screenshot" | "discord";
};

export async function saveReferencePost(input: ReferencePostInput) {
  const account = input.account.trim() || "manual_reference";
  const content = input.content.trim();
  if (!content) {
    throw new Error("Reference content is required");
  }

  const result = await importCompetitorPosts([
    {
      competitor: account,
      platform: input.platform,
      external_url: input.external_url,
      source_type: input.source_type || (input.screenshot_data_url ? "screenshot" : "manual"),
      screenshot_data_url: input.screenshot_data_url,
      content,
      reply_content: input.reply_content,
      structure_notes: input.structure_notes,
      pattern_tags: input.pattern_tags,
      impressions: input.impressions,
      likes: input.likes,
      reposts: input.reposts,
      replies: input.replies,
      posted_at: input.posted_at || new Date().toISOString()
    }
  ]);

  return result;
}

export function parsePatternTags(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : [value || ""];
  return values
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}
