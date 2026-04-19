import { detectDangerousContent } from "@/lib/safety";
import { predictPostScore } from "@/lib/scoring";
import type { AccountRow, AccountStrategy, CompetitorPostRow } from "@/lib/types";

type GeneratedPost = {
  content: string;
  predicted_score: number;
  safety_flags: string[];
};

type GenerateInput = {
  account: AccountRow;
  date: string;
  count: number;
  competitorPosts?: Pick<CompetitorPostRow, "content" | "reply_content" | "structure_notes" | "impressions" | "likes" | "reposts" | "replies">[];
};

const RANDOM_THEMES = [
  "英語日記",
  "3語で言い換える",
  "聞き返し",
  "朝のひとこと",
  "海外ドラマのまね",
  "独り言英語",
  "通じればOK"
];

const EDUCATION_THEMES = [
  "現在形",
  "get の使い方",
  "because の後ろ",
  "前置詞 in/on/at",
  "would like",
  "発音よりリズム",
  "質問文の型"
];

const RANDOM_TEMPLATES = [
  (theme: string) => `英語は「ちゃんと話す」より「今日1回使う」で伸びやすいです。\n\n今日は ${theme} を1つだけ。短くていいので、声に出して終わりにしましょう。`,
  (theme: string) => `${theme} は、きれいな英文を作る練習より「自分が本当に言いそうな一文」にすると続きます。\n\n例: I need coffee first.\nこのくらいで十分です。`,
  (theme: string) => `今日の英語メモ。\n\n${theme} は、完璧に覚えるより「使う場面」を1つ決めると残りやすいです。\n\n通勤中、買い物中、寝る前。どれか1つでOK。`
];

const EDUCATION_TEMPLATES = [
  (theme: string) => `初心者向けの ${theme}。\n\n英語は単語だけで覚えるより、短い型で覚えると使いやすいです。\n\nまずは1文だけ作って、声に出すところまでやりましょう。`,
  (theme: string) => `${theme} で迷ったら、最初は「伝わる順番」を優先でOKです。\n\n1. 誰が\n2. 何をする\n3. いつ・どこで\n\n細かい修正はあとから足せます。`,
  (theme: string) => `今日の小さな型: ${theme}\n\n「知っている」から「言える」に変えるには、例文を1つ自分用に変えるのが近道です。\n\n短くても、自分の生活に寄せると残ります。`
];

export function generatePostsForAccount(input: GenerateInput): GeneratedPost[] {
  const themes = buildThemePool(input.account.strategy, input.competitorPosts || []);
  const templates = input.account.strategy === "education" ? EDUCATION_TEMPLATES : RANDOM_TEMPLATES;

  return Array.from({ length: input.count }, (_, index) => {
    const theme = pick(themes, `${input.account.id}:${input.date}:theme:${index}`);
    const template = pick(templates, `${input.account.id}:${input.date}:template:${index}`);
    const content = template(theme);
    const safety_flags = detectDangerousContent(content);

    return {
      content,
      predicted_score: predictPostScore(content, input.account.strategy),
      safety_flags
    };
  });
}

function buildThemePool(
  strategy: AccountStrategy,
  competitorPosts: Pick<CompetitorPostRow, "content" | "reply_content" | "structure_notes" | "impressions" | "likes" | "reposts" | "replies">[]
): string[] {
  const base = strategy === "education" ? EDUCATION_THEMES : RANDOM_THEMES;
  const signals = competitorPosts
    .slice()
    .sort((a, b) => competitorSignalScore(b) - competitorSignalScore(a))
    .flatMap((post) => extractThemeHints([post.content, post.reply_content, post.structure_notes].filter(Boolean).join("\n")))
    .slice(0, 6);

  return [...signals, ...base];
}

function competitorSignalScore(post: Pick<CompetitorPostRow, "impressions" | "likes" | "reposts" | "replies">): number {
  const impressions = Number(post.impressions || 0);
  const engagement = Number(post.likes || 0) + Number(post.reposts || 0) * 2 + Number(post.replies || 0) * 1.5;
  return impressions > 0 ? impressions : engagement;
}

function extractThemeHints(content: string): string[] {
  const hints = [];
  if (/前置詞|in|on|at/i.test(content)) hints.push("前置詞 in/on/at");
  if (/発音|リズム/i.test(content)) hints.push("発音よりリズム");
  if (/日記|diary/i.test(content)) hints.push("英語日記");
  if (/フレーズ|phrase/i.test(content)) hints.push("短いフレーズ");
  if (/初心者|beginner/i.test(content)) hints.push("初心者の型");
  return hints;
}

function pick<T>(items: T[], seed: string): T {
  return items[hash(seed) % items.length];
}

function hash(input: string): number {
  let value = 2166136261;
  for (const char of input) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}
