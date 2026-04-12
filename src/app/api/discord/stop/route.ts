import { NextResponse } from "next/server";
import { verifySecret } from "@/lib/http";
import { stopPostFromDiscordCommand } from "@/lib/jobs/notify";

export async function POST(request: Request) {
  const unauthorized = verifySecret(request, "DISCORD_STOP_SECRET");
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const command = String(body.command || "");
  const batchId = typeof body.batchId === "string" ? body.batchId : undefined;
  const result = await stopPostFromDiscordCommand(command, batchId);
  return NextResponse.json(result);
}
