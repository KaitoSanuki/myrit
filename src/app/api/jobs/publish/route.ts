import { NextResponse } from "next/server";
import { verifySecret } from "@/lib/http";
import { publishDuePosts } from "@/lib/jobs/publish";

export async function POST(request: Request) {
  const unauthorized = verifySecret(request);
  if (unauthorized) return unauthorized;

  const result = await publishDuePosts();
  return NextResponse.json(result);
}
