import { getOptionalEnv } from "@/lib/env";

export const DEFAULT_DAILY_POST_TIMES = ["08:00", "12:00", "16:00", "19:00", "22:00"];

export function getScheduleOffset(): string {
  return getOptionalEnv("POST_TIMEZONE_OFFSET", "+09:00");
}

export function getDailyPostTimes(): string[] {
  const raw = getOptionalEnv("DAILY_POST_TIMES");
  if (!raw) return DEFAULT_DAILY_POST_TIMES;
  return raw
    .split(",")
    .map((time) => time.trim())
    .filter((time) => /^\d{2}:\d{2}$/.test(time));
}

export function scheduleAtForDate(date: string, time: string, offset = getScheduleOffset()): string {
  return new Date(`${date}T${time}:00${offset}`).toISOString();
}

export function getLocalDate(date = new Date(), offset = getScheduleOffset()): string {
  const shifted = new Date(date.getTime() + offsetToMs(offset));
  return shifted.toISOString().slice(0, 10);
}

export function getPreviousLocalDate(date = new Date(), offset = getScheduleOffset()): string {
  const previous = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return getLocalDate(previous, offset);
}

export function dayRange(date: string, offset = getScheduleOffset()): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00${offset}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatTimeForOffset(iso: string, offset = getScheduleOffset()): string {
  const shifted = new Date(new Date(iso).getTime() + offsetToMs(offset));
  return shifted.toISOString().slice(11, 16);
}

function offsetToMs(offset: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}
