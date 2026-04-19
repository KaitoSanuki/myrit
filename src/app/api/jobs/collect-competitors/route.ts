import { NextResponse } from "next/server";
import { verifySecret } from "@/lib/http";
import { collectWeeklyTopCompetitorPosts } from "@/lib/jobs/collect-competitor-top-posts";

export async function POST(request: Request) {
  const unauthorized = verifySecret(request);
  if (unauthorized) return unauthorized;

  const daysParam = new URL(request.url).searchParams.get("days");
  const days = daysParam ? Number(daysParam) : undefined;
  const result = await collectWeeklyTopCompetitorPosts(days);
  return NextResponse.json(result);
}
