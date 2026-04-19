import { NextRequest, NextResponse } from "next/server";
import { REFERENCE_AUTH_COOKIE } from "@/lib/reference-auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  response.cookies.set(REFERENCE_AUTH_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
