import { NextResponse } from "next/server";
import { verifySecret } from "@/lib/http";
import { generateDailyPosts } from "@/lib/jobs/generate";
import { notifyTodayPosts } from "@/lib/jobs/notify";

export async function POST(request: Request) {
  const unauthorized = verifySecret(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || undefined;
  const shouldNotify = ["1", "true", "yes"].includes((url.searchParams.get("notify") || "").toLowerCase());
  const result = await generateDailyPosts(date);
  const notification = shouldNotify ? await notifyTodayPosts(result.date) : undefined;
  return NextResponse.json(notification ? { ...result, notification } : result);
}
