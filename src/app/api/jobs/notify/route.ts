import { NextResponse } from "next/server";
import { verifySecret } from "@/lib/http";
import { notifyTodayPosts } from "@/lib/jobs/notify";

export async function POST(request: Request) {
  const unauthorized = verifySecret(request);
  if (unauthorized) return unauthorized;

  const date = new URL(request.url).searchParams.get("date") || undefined;
  const result = await notifyTodayPosts(date);
  return NextResponse.json(result);
}
