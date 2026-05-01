import { NextResponse } from "next/server";
import { verifySecret } from "@/lib/http";
import { publishDuePosts } from "@/lib/jobs/publish";

export async function POST(request: Request) {
  const unauthorized = verifySecret(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const platformParam = url.searchParams.get("platform");
  const postId = url.searchParams.get("postId") || undefined;
  const ignoreSchedule = ["1", "true", "yes"].includes((url.searchParams.get("ignoreSchedule") || "").toLowerCase());
  const parsedLimit = limitParam ? Number(limitParam) : undefined;

  const result = await publishDuePosts({
    limit: parsedLimit && Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    platform: platformParam === "x" || platformParam === "threads" ? platformParam : undefined,
    postId,
    ignoreSchedule
  });
  return NextResponse.json(result);
}
