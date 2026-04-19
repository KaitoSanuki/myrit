import { createHmac, timingSafeEqual } from "node:crypto";
import { getNumberEnv } from "@/lib/env";

export const REFERENCE_AUTH_COOKIE = "myrit_reference_auth";

export function getReferenceAuthSecret(): string {
  return process.env.REFERENCE_INGEST_SECRET || process.env.CRON_SECRET || "";
}

export function getReferenceAuthMaxAgeSeconds(): number {
  return getNumberEnv("REFERENCE_AUTH_MAX_AGE_SECONDS", 60 * 60 * 24 * 30);
}

export function createReferenceAuthToken(secret: string, issuedAt = Date.now()): string {
  return `${issuedAt}.${signReferenceAuthToken(secret, issuedAt)}`;
}

export function verifyReferencePassword(value: string | undefined | null, secret: string): boolean {
  if (!value || !secret) return false;
  return safeEqual(value, secret);
}

export function verifyReferenceAuthToken(token: string | undefined | null, secret: string): boolean {
  if (!token || !secret) return false;

  const [issuedAtRaw, signature] = token.split(".");
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || !signature) return false;

  const maxAgeMs = getReferenceAuthMaxAgeSeconds() * 1000;
  if (Date.now() - issuedAt > maxAgeMs) return false;

  const expected = signReferenceAuthToken(secret, issuedAt);
  return safeEqual(signature, expected);
}

function signReferenceAuthToken(secret: string, issuedAt: number): string {
  return createHmac("sha256", secret)
    .update(`reference-upload:${issuedAt}`)
    .digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
