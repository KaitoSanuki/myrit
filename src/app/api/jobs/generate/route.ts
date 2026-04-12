import { NextResponse } from "next/server";
import { verifySecret } from "@/lib/http";
import { generateDailyPosts } from "@/lib/jobs/generate";

export async function POST(request: Request) {
  const unauthorized = verifySecret(request);
  if (unauthorized) return unauthorized;

  const date = new URL(request.url).searchParams.get("date") || undefined;
  const result = await generateDailyPosts(date);
  return NextResponse.json(result);
}
