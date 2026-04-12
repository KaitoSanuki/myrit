import { getOptionalEnv } from "@/lib/env";
import { formatTimeForOffset } from "@/lib/time";
import type { AccountRow, PostRow } from "@/lib/types";

type PostWithAccount = PostRow & {
  accounts?: Pick<AccountRow, "code" | "label" | "strategy"> | null;
};

export type DiscordSendResult = {
  skipped: boolean;
  messageId?: string;
};

export async function sendDiscordMessage(content: string): Promise<DiscordSendResult> {
  const webhookUrl = getOptionalEnv("DISCORD_WEBHOOK_URL");
  if (!webhookUrl) return { skipped: true };

  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return { skipped: false, messageId: payload?.id };
}

export function formatDailyPostSummaries(posts: PostWithAccount[]): string[] {
  const chunks: string[] = [];
  let lines = ["【本日の投稿予定】", ""];
  const footer = ["停止する場合: stop 番号", "危険検知に引っかかった投稿は自動停止されます。"];

  posts.forEach((post, index) => {
    const account = post.accounts ? `${post.accounts.code}/${post.accounts.label}` : post.account_id;
    const block = [
      `${index + 1}. ${formatTimeForOffset(post.scheduled_at)} / ${account} / ${post.platform.toUpperCase()}`,
      `「${shorten(post.content, 180)}」`,
      `予測: ${Math.round(post.predicted_score)} / 停止: stop ${index + 1}`,
      ""
    ];

    const candidate = [...lines, ...block, ...footer].join("\n");
    if (candidate.length > 1900 && lines.length > 2) {
      chunks.push([...lines, ...footer].join("\n"));
      lines = ["【本日の投稿予定 続き】", "", ...block];
    } else {
      lines.push(...block);
    }
  });

  chunks.push([...lines, ...footer].join("\n"));
  return chunks;
}

export function formatDailyPostSummary(posts: PostWithAccount[]): string {
  return formatDailyPostSummaries(posts)[0];
}

export function parseStopCommand(command: string): number | null {
  const match = /^\s*stop\s+(\d+)\s*$/i.exec(command);
  if (!match) return null;
  return Number(match[1]);
}

function shorten(content: string, limit: number): string {
  return content.length <= limit ? content : `${content.slice(0, limit - 1)}…`;
}
