import { NextResponse } from "next/server";

export function verifySecret(request: Request, envName = "CRON_SECRET"): NextResponse | null {
  const expected = process.env[envName] || (envName === "DISCORD_STOP_SECRET" ? process.env.CRON_SECRET : "");
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: `${envName} is not configured` }, { status: 500 });
    }
    return null;
  }

  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const querySecret = new URL(request.url).searchParams.get("secret") || "";

  if (bearer === expected || querySecret === expected) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
