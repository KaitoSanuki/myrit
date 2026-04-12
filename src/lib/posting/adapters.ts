import { randomUUID } from "node:crypto";
import { getOptionalEnv, isDryRunPosting } from "@/lib/env";
import type { KpiMetrics, Platform, PostRow } from "@/lib/types";

type PublishResult = {
  externalId: string;
  externalUrl?: string;
};

export type SocialPoster = {
  publish(post: Pick<PostRow, "id" | "content" | "platform">): Promise<PublishResult>;
  collectKpis(post: Pick<PostRow, "id" | "content" | "platform" | "external_post_id">): Promise<KpiMetrics>;
};

export function getPoster(platform: Platform): SocialPoster {
  return platform === "x" ? new XPoster() : new ThreadsPoster();
}

class XPoster implements SocialPoster {
  async publish(post: Pick<PostRow, "id" | "content">): Promise<PublishResult> {
    if (isDryRunPosting()) {
      const externalId = `dry-x-${post.id}-${randomUUID().slice(0, 8)}`;
      return { externalId, externalUrl: `https://x.com/i/web/status/${externalId}` };
    }

    const token = getOptionalEnv("X_USER_ACCESS_TOKEN") || getOptionalEnv("X_BEARER_TOKEN");
    if (!token) throw new Error("X_USER_ACCESS_TOKEN is required when DRY_RUN_POSTING=false");

    const response = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: post.content })
    });

    const payload = await safeJson(response);
    if (!response.ok) {
      throw new Error(`X publish failed: ${response.status} ${JSON.stringify(payload)}`);
    }

    const externalId = payload?.data?.id;
    if (!externalId) throw new Error(`X publish response did not include data.id: ${JSON.stringify(payload)}`);
    return { externalId, externalUrl: `https://x.com/i/web/status/${externalId}` };
  }

  async collectKpis(post: Pick<PostRow, "id" | "external_post_id">): Promise<KpiMetrics> {
    if (isDryRunPosting()) return simulatedKpis(post.id);
    if (!post.external_post_id) throw new Error("external_post_id is required for X KPI collection");

    const token = getOptionalEnv("X_BEARER_TOKEN") || getOptionalEnv("X_USER_ACCESS_TOKEN");
    if (!token) throw new Error("X_BEARER_TOKEN is required for X KPI collection");

    const url = new URL(`https://api.x.com/2/tweets/${post.external_post_id}`);
    url.searchParams.set("tweet.fields", "public_metrics");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const payload = await safeJson(response);
    if (!response.ok) {
      throw new Error(`X KPI collection failed: ${response.status} ${JSON.stringify(payload)}`);
    }

    const metrics = payload?.data?.public_metrics || {};
    return {
      impressions: Number(metrics.impression_count || 0),
      likes: Number(metrics.like_count || 0),
      reposts: Number(metrics.retweet_count || 0) + Number(metrics.quote_count || 0),
      replies: Number(metrics.reply_count || 0),
      followers_delta: 0
    };
  }
}

class ThreadsPoster implements SocialPoster {
  async publish(post: Pick<PostRow, "id" | "content">): Promise<PublishResult> {
    if (isDryRunPosting()) {
      const externalId = `dry-threads-${post.id}-${randomUUID().slice(0, 8)}`;
      return { externalId, externalUrl: `https://www.threads.net/t/${externalId}` };
    }

    const accessToken = getOptionalEnv("THREADS_ACCESS_TOKEN");
    const userId = getOptionalEnv("THREADS_USER_ID", "me");
    const baseUrl = getOptionalEnv("THREADS_API_BASE_URL", "https://graph.threads.net");
    if (!accessToken) throw new Error("THREADS_ACCESS_TOKEN is required when DRY_RUN_POSTING=false");

    const createResponse = await fetch(`${baseUrl}/${userId}/threads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        media_type: "TEXT",
        text: post.content
      })
    });

    const createPayload = await safeJson(createResponse);
    if (!createResponse.ok) {
      throw new Error(`Threads container creation failed: ${createResponse.status} ${JSON.stringify(createPayload)}`);
    }

    const creationId = createPayload?.id;
    if (!creationId) throw new Error(`Threads create response did not include id: ${JSON.stringify(createPayload)}`);

    const publishResponse = await fetch(`${baseUrl}/${userId}/threads_publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ creation_id: creationId })
    });

    const publishPayload = await safeJson(publishResponse);
    if (!publishResponse.ok) {
      throw new Error(`Threads publish failed: ${publishResponse.status} ${JSON.stringify(publishPayload)}`);
    }

    const externalId = publishPayload?.id || creationId;
    return { externalId, externalUrl: `https://www.threads.net/t/${externalId}` };
  }

  async collectKpis(post: Pick<PostRow, "id" | "external_post_id">): Promise<KpiMetrics> {
    if (isDryRunPosting()) return simulatedKpis(post.id);
    if (!post.external_post_id) throw new Error("external_post_id is required for Threads KPI collection");

    const accessToken = getOptionalEnv("THREADS_ACCESS_TOKEN");
    const baseUrl = getOptionalEnv("THREADS_API_BASE_URL", "https://graph.threads.net");
    if (!accessToken) throw new Error("THREADS_ACCESS_TOKEN is required for Threads KPI collection");

    const url = new URL(`${baseUrl}/${post.external_post_id}/insights`);
    url.searchParams.set("metric", "views,likes,reposts,replies");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const payload = await safeJson(response);
    if (!response.ok) {
      throw new Error(`Threads KPI collection failed: ${response.status} ${JSON.stringify(payload)}`);
    }

    const values = metricsArrayToObject(payload?.data || []);
    return {
      impressions: Number(values.views || 0),
      likes: Number(values.likes || 0),
      reposts: Number(values.reposts || 0),
      replies: Number(values.replies || 0),
      followers_delta: 0
    };
  }
}

async function safeJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function metricsArrayToObject(items: any[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = Array.isArray(item.values) ? item.values[0]?.value : item.value;
    acc[item.name] = Number(value || 0);
    return acc;
  }, {});
}

function simulatedKpis(seed: string): KpiMetrics {
  const base = hash(seed);
  const metrics = {
    impressions: 120 + (base % 2400),
    likes: base % 46,
    reposts: Math.floor((base / 7) % 12),
    replies: Math.floor((base / 13) % 9),
    followers_delta: Math.floor((base / 29) % 4)
  };

  return metrics;
}

function hash(input: string): number {
  let value = 0;
  for (const char of input) {
    value = (value << 5) - value + char.charCodeAt(0);
    value |= 0;
  }
  return Math.abs(value);
}
