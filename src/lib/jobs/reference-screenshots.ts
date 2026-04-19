import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Platform, ReferenceScreenshotRow } from "@/lib/types";

export type CreateReferenceScreenshotInput = {
  platform: Platform;
  screenshot_data_url: string;
  account_hint?: string;
  source_type?: "dashboard" | "discord";
};

export async function createReferenceScreenshot(input: CreateReferenceScreenshotInput) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("reference_screenshots")
    .insert({
      platform: input.platform,
      screenshot_data_url: input.screenshot_data_url,
      account_hint: input.account_hint || null,
      source_type: input.source_type || "dashboard",
      status: "pending"
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as ReferenceScreenshotRow;
}

export async function getPendingReferenceScreenshots(limit = 5) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("reference_screenshots")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data || []) as ReferenceScreenshotRow[];
}

export async function markReferenceScreenshotAnalyzing(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("reference_screenshots")
    .update({ status: "analyzing", analysis_error: null })
    .eq("id", id);

  if (error) throw error;
}

export async function markReferenceScreenshotAnalyzed(id: string, competitorPostId?: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("reference_screenshots")
    .update({
      status: "analyzed",
      analysis_error: null,
      competitor_post_id: competitorPostId || null,
      analyzed_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) throw error;
}

export async function markReferenceScreenshotFailed(id: string, errorMessage: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("reference_screenshots")
    .update({
      status: "failed",
      analysis_error: errorMessage.slice(0, 1000),
      analyzed_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) throw error;
}
