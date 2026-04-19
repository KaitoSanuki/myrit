import { NextResponse } from "next/server";
import { getNumberEnv } from "@/lib/env";
import { parsePatternTags, saveReferencePost } from "@/lib/jobs/reference-posts";
import { createReferenceScreenshot } from "@/lib/jobs/reference-screenshots";
import type { Platform } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

async function handlePost(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const unauthorized = verifyReferenceSecret(request, String(form.get("secret") || ""));
    if (unauthorized) return unauthorized;

    const input = await referenceInputFromForm(form);
    if (input.screenshot_data_url && !input.content.trim()) {
      await createReferenceScreenshot({
        platform: input.platform,
        screenshot_data_url: input.screenshot_data_url,
        account_hint: input.account,
        source_type: "dashboard"
      });
      return NextResponse.redirect(new URL("/?reference=pending", request.url), { status: 303 });
    }

    await saveReferencePost(input);
    return NextResponse.redirect(new URL("/?reference=created", request.url), { status: 303 });
  }

  const unauthorized = verifyReferenceSecret(request);
  if (unauthorized) return unauthorized;

  const body = await request.json();
  const content = String(body.content || "").trim();
  if (body.screenshot_data_url && !content) {
    await createReferenceScreenshot({
      platform: normalizePlatform(body.platform),
      screenshot_data_url: String(body.screenshot_data_url),
      account_hint: optionalString(body.account),
      source_type: body.source_type === "discord" ? "discord" : "dashboard"
    });

    return NextResponse.json({ ok: true, status: "pending_analysis" });
  }

  await saveReferencePost({
    account: String(body.account || ""),
    platform: normalizePlatform(body.platform),
    content,
    reply_content: optionalString(body.reply_content),
    structure_notes: optionalString(body.structure_notes),
    pattern_tags: parsePatternTags(body.pattern_tags),
    screenshot_data_url: optionalString(body.screenshot_data_url),
    external_url: optionalString(body.external_url),
    impressions: optionalNumber(body.impressions),
    likes: optionalNumber(body.likes),
    reposts: optionalNumber(body.reposts),
    replies: optionalNumber(body.replies),
    posted_at: optionalString(body.posted_at),
    source_type: body.source_type === "discord" ? "discord" : undefined
  });

  return NextResponse.json({ ok: true });
}

async function referenceInputFromForm(form: FormData) {
  const file = form.get("screenshot");
  const screenshotDataUrl = file instanceof File && file.size > 0 ? await fileToDataUrl(file) : undefined;

  return {
    account: String(form.get("account") || "manual_reference"),
    platform: normalizePlatform(form.get("platform")),
    content: String(form.get("content") || ""),
    reply_content: optionalString(form.get("reply_content")),
    structure_notes: optionalString(form.get("structure_notes")),
    pattern_tags: parsePatternTags(String(form.get("pattern_tags") || "")),
    screenshot_data_url: screenshotDataUrl,
    external_url: optionalString(form.get("external_url")),
    impressions: optionalNumber(form.get("impressions")),
    likes: optionalNumber(form.get("likes")),
    reposts: optionalNumber(form.get("reposts")),
    replies: optionalNumber(form.get("replies")),
    posted_at: optionalString(form.get("posted_at")),
    source_type: screenshotDataUrl ? "screenshot" as const : "manual" as const
  };
}

function verifyReferenceSecret(request: Request, formSecret = ""): NextResponse | null {
  const expected = process.env.REFERENCE_INGEST_SECRET || process.env.CRON_SECRET || "";
  if (!expected) return null;

  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const querySecret = new URL(request.url).searchParams.get("secret") || "";

  if (bearer === expected || querySecret === expected || formSecret === expected) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function fileToDataUrl(file: File): Promise<string> {
  const maxBytes = getNumberEnv("REFERENCE_SCREENSHOT_MAX_BYTES", 1_500_000);
  if (file.size > maxBytes) {
    throw new Error(`Screenshot is too large. Max ${maxBytes} bytes.`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mediaType = file.type || "application/octet-stream";
  return `data:${mediaType};base64,${bytes.toString("base64")}`;
}

function normalizePlatform(value: FormDataEntryValue | string | undefined | null): Platform {
  return value === "threads" ? "threads" : "x";
}

function optionalString(value: FormDataEntryValue | string | undefined | null): string | undefined {
  const text = String(value || "").trim();
  return text || undefined;
}

function optionalNumber(value: FormDataEntryValue | string | number | undefined | null): number | undefined {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}
