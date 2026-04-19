import { NextResponse } from "next/server";
import { verifySecret } from "@/lib/http";
import { parsePatternTags, saveReferencePost } from "@/lib/jobs/reference-posts";

export async function POST(request: Request) {
  const unauthorized = verifySecret(request, "DISCORD_STOP_SECRET");
  if (unauthorized) return unauthorized;

  const body = await request.json();
  const result = await saveReferencePost({
    account: String(body.account || "discord_reference"),
    platform: body.platform === "threads" ? "threads" : "x",
    content: String(body.content || body.text || ""),
    reply_content: body.reply_content,
    structure_notes: body.structure_notes || body.note,
    pattern_tags: parsePatternTags(body.pattern_tags || body.tags),
    screenshot_data_url: body.screenshot_data_url,
    external_url: body.external_url || body.url,
    impressions: optionalNumber(body.impressions),
    likes: optionalNumber(body.likes),
    reposts: optionalNumber(body.reposts),
    replies: optionalNumber(body.replies),
    posted_at: body.posted_at,
    source_type: "discord"
  });

  return NextResponse.json({ ok: true, result });
}

function optionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}
