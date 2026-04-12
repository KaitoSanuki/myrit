export type Platform = "x" | "threads";
export type PostStatus = "pending" | "posted" | "stopped" | "failed";
export type AccountStrategy = "random" | "education";
export type AnalysisType = "daily" | "weekly";

export type AccountRow = {
  id: string;
  code: string;
  label: string;
  strategy: AccountStrategy;
  platforms: Platform[];
  active: boolean;
  created_at: string;
};

export type PostRow = {
  id: string;
  account_id: string;
  platform: Platform;
  content: string;
  scheduled_at: string;
  status: PostStatus;
  score: number;
  predicted_score: number;
  safety_flags: string[];
  external_post_id: string | null;
  external_url: string | null;
  posted_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ResultRow = {
  id: string;
  post_id: string;
  impressions: number;
  likes: number;
  reposts: number;
  replies: number;
  followers_delta: number;
  score: number;
  collected_at: string;
};

export type CompetitorPostRow = {
  id: string;
  competitor_id: string;
  content: string;
  likes: number;
  reposts: number;
  replies: number;
  posted_at: string;
  created_at: string;
};

export type KpiMetrics = {
  impressions: number;
  likes: number;
  reposts: number;
  replies: number;
  followers_delta: number;
};
