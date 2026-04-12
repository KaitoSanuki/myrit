import type { AccountStrategy, KpiMetrics } from "@/lib/types";

export function calculateActualScore(metrics: KpiMetrics): number {
  return metrics.likes * 1 + metrics.reposts * 2 + metrics.replies * 1.5 + metrics.followers_delta * 3;
}

export function predictPostScore(content: string, strategy: AccountStrategy): number {
  let score = strategy === "education" ? 42 : 38;
  const length = [...content].length;

  if (length >= 55 && length <= 180) score += 14;
  if (length > 180 && length <= 240) score += 6;
  if (/今日|3分|まず|初心者|英語/.test(content)) score += 8;
  if (/[？?]/.test(content)) score += 5;
  if (/試して|声に出して|メモ|保存/.test(content)) score += 7;
  if (/例えば|つまり|型|フレーズ/.test(content)) score += 6;
  if (/必ず|絶対|情弱|バカ/.test(content)) score -= 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function summarizeKpi(metrics: KpiMetrics): string {
  return `imp ${metrics.impressions} / likes ${metrics.likes} / reposts ${metrics.reposts} / replies ${metrics.replies} / follows ${metrics.followers_delta}`;
}
