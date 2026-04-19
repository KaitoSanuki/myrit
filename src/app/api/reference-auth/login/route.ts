import { NextRequest, NextResponse } from "next/server";
import {
  createReferenceAuthToken,
  getReferenceAuthMaxAgeSeconds,
  getReferenceAuthSecret,
  REFERENCE_AUTH_COOKIE,
  verifyReferencePassword
} from "@/lib/reference-auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get("password") || "");
  const secret = getReferenceAuthSecret();
  const redirectUrl = new URL("/", request.url);

  if (!secret || !verifyReferencePassword(password, secret)) {
    redirectUrl.searchParams.set("reference_login", "failed");
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  response.cookies.set(REFERENCE_AUTH_COOKIE, createReferenceAuthToken(secret), {
    httpOnly: true,
    maxAge: getReferenceAuthMaxAgeSeconds(),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
