import { NextResponse } from "next/server";
import { verifySecret } from "@/lib/http";
import { analyzeWeeklyCompetitors } from "@/lib/jobs/analyze";

export async function POST(request: Request) {
  const unauthorized = verifySecret(request);
  if (unauthorized) return unauthorized;

  const date = new URL(request.url).searchParams.get("date") || undefined;
  const result = await analyzeWeeklyCompetitors(date);
  return NextResponse.json(result);
}
