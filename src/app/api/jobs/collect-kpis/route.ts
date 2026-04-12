import { NextResponse } from "next/server";
import { verifySecret } from "@/lib/http";
import { collectPostKpis } from "@/lib/jobs/collect-kpis";

export async function POST(request: Request) {
  const unauthorized = verifySecret(request);
  if (unauthorized) return unauthorized;

  const result = await collectPostKpis();
  return NextResponse.json(result);
}
