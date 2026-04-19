import { createOptionalSupabaseAdminClient } from "@/lib/supabase/admin";
import { describeSafetyFlags } from "@/lib/safety";
import { formatTimeForOffset } from "@/lib/time";

export const dynamic = "force-dynamic";

type DashboardData = {
  posts: any[];
  results: any[];
  analysis: any[];
  competitors: any[];
  competitorPosts: any[];
  referenceScreenshots: any[];
  error?: string;
};

export default async function DashboardPage() {
  const data = await loadDashboardData();

  if (!data) {
    return (
      <main className="shell">
        <section className="hero">
          <p className="eyebrow">Setup</p>
          <h1>Supabase 接続待ち</h1>
          <p>`.env.local` に `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を入れると、投稿とKPIがここに流れます。</p>
        </section>
      </main>
    );
  }

  const pending = data.posts.filter((post) => post.status === "pending").length;
  const posted = data.posts.filter((post) => post.status === "posted").length;
  const stopped = data.posts.filter((post) => post.status === "stopped").length;
  const scoreSum = data.posts.reduce((sum, post) => sum + Number(post.score || 0), 0);

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">English Growth Ops</p>
        <h1>今日の投稿運用</h1>
        <p>生成、停止、投稿、KPI、改善案を1画面で確認します。</p>
      </section>

      {data.error ? <p className="alert">{data.error}</p> : null}

      <section className="metrics" aria-label="運用状況">
        <Metric label="Pending" value={pending} />
        <Metric label="Posted" value={posted} />
        <Metric label="Stopped" value={stopped} />
        <Metric label="Score" value={Math.round(scoreSum)} />
      </section>

      <section className="band">
        <div className="section-heading">
          <p className="eyebrow">Queue</p>
          <h2>投稿一覧</h2>
        </div>
        <div className="post-list">
          {data.posts.length === 0 ? <p className="empty">投稿はまだありません。</p> : null}
          {data.posts.map((post) => (
            <article className="post-row" key={post.id}>
              <div>
                <p className="post-meta">
                  {formatTimeForOffset(post.scheduled_at)} / {post.platform.toUpperCase()} / {post.accounts?.code || "?"}
                </p>
                <p className="post-content">{post.content}</p>
                {post.safety_flags?.length ? <p className="warning">危険検知: {describeSafetyFlags(post.safety_flags)}</p> : null}
              </div>
              <div className={`status status-${post.status}`}>
                <span>{post.status}</span>
                <strong>{Math.round(Number(post.score || post.predicted_score || 0))}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="band split">
        <div>
          <div className="section-heading">
            <p className="eyebrow">KPI</p>
            <h2>24時間後スコア</h2>
          </div>
          <KpiBars results={data.results} />
        </div>
        <div>
          <div className="section-heading">
            <p className="eyebrow">System</p>
            <h2>状態</h2>
          </div>
          <dl className="status-list">
            <div>
              <dt>競合</dt>
              <dd>{data.competitors.filter((item) => item.active).length} 件</dd>
            </div>
            <div>
              <dt>分析</dt>
              <dd>{data.analysis.length} 件</dd>
            </div>
            <div>
              <dt>停止ルール</dt>
              <dd>政治 / 差別 / 不確実情報 / 強い煽り</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="band">
        <div className="section-heading">
          <p className="eyebrow">Competitors</p>
          <h2>参考投稿を追加</h2>
        </div>
        <form className="reference-form" action="/api/references" method="post" encType="multipart/form-data">
          <label>
            登録キー
            <input name="secret" type="password" placeholder="CRON_SECRET または REFERENCE_INGEST_SECRET" />
          </label>
          <label>
            スクショ
            <input name="screenshot" type="file" accept="image/*" />
          </label>
          <label>
            アカウント
            <input name="account" placeholder="例: ayapan_051" />
          </label>
          <label>
            プラットフォーム
            <select name="platform" defaultValue="x">
              <option value="x">X</option>
              <option value="threads">Threads</option>
            </select>
          </label>
          <label className="wide-field">
            本文
            <textarea name="content" placeholder="空欄ならCodexがスクショから読み取ります" />
          </label>
          <label className="wide-field">
            リプ・続き
            <textarea name="reply_content" placeholder="リプに置いている答え、ランキング上位、続きなど" />
          </label>
          <label className="wide-field">
            構造メモ
            <textarea name="structure_notes" placeholder="例: Tier表でAを空欄にし、答えをリプに置いてクリックを誘う" />
          </label>
          <label>
            タグ
            <input name="pattern_tags" placeholder="tier, reply_bait, curiosity_gap" />
          </label>
          <label>
            インプレッション
            <input name="impressions" type="number" min="0" />
          </label>
          <label>
            いいね
            <input name="likes" type="number" min="0" />
          </label>
          <label>
            リポスト
            <input name="reposts" type="number" min="0" />
          </label>
          <label>
            返信
            <input name="replies" type="number" min="0" />
          </label>
          <label>
            投稿日
            <input name="posted_at" type="date" />
          </label>
          <label className="wide-field">
            URL
            <input name="external_url" placeholder="任意" />
          </label>
          <button type="submit">参考に追加</button>
        </form>
      </section>

      <section className="band">
        <div className="section-heading">
          <p className="eyebrow">Codex Queue</p>
          <h2>スクショ解析待ち</h2>
        </div>
        <div className="post-list">
          {data.referenceScreenshots.length === 0 ? <p className="empty">解析待ちのスクショはありません。</p> : null}
          {data.referenceScreenshots.map((item) => (
            <article className="post-row" key={item.id}>
              <div>
                <p className="post-meta">
                  {formatDate(item.created_at)} / {item.platform.toUpperCase()} / {item.status}
                </p>
                {item.analysis_error ? <p className="warning">{item.analysis_error}</p> : null}
                <img className="reference-image" src={item.screenshot_data_url} alt="解析待ちのスクショ" />
              </div>
              <div className={`status status-${item.status === "failed" ? "failed" : "pending"}`}>
                <span>{item.status}</span>
                <strong>{item.account_hint || "Codex"}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="band">
        <div className="section-heading">
          <p className="eyebrow">References</p>
          <h2>参考投稿リスト</h2>
        </div>
        <div className="post-list">
          {data.competitorPosts.length === 0 ? <p className="empty">競合投稿はまだありません。</p> : null}
          {data.competitorPosts.map((post) => (
            <article className="post-row" key={post.id}>
              <div>
                <p className="post-meta">
                  {formatDate(post.posted_at)} / {post.competitors?.platform?.toUpperCase() || "X"} / @
                  {post.competitors?.account || "unknown"}
                </p>
                <p className="post-content">{post.content}</p>
                {post.reply_content ? <p className="reply-content">リプ: {post.reply_content}</p> : null}
                {post.structure_notes ? <p className="structure-notes">{post.structure_notes}</p> : null}
                {post.pattern_tags?.length ? <p className="tag-list">{post.pattern_tags.join(" / ")}</p> : null}
                {post.external_url ? (
                  <a className="post-link" href={post.external_url} target="_blank" rel="noreferrer">
                    元投稿を開く
                  </a>
                ) : null}
                {post.screenshot_data_url ? (
                  <img className="reference-image" src={post.screenshot_data_url} alt="参考投稿のスクショ" />
                ) : null}
              </div>
              <div className="status">
                <span>IMP</span>
                <strong>{formatNumber(post.impressions)}</strong>
                <small>
                  L {formatNumber(post.likes)} / RP {formatNumber(post.reposts)} / RE {formatNumber(post.replies)}
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="band">
        <div className="section-heading">
          <p className="eyebrow">PDCA</p>
          <h2>改善提案</h2>
        </div>
        <div className="analysis-list">
          {data.analysis.length === 0 ? <p className="empty">分析はまだありません。</p> : null}
          {data.analysis.map((item) => (
            <article className="analysis-item" key={item.id}>
              <p className="post-meta">
                {item.date} / {item.type}
              </p>
              <p>{item.insight}</p>
              <strong>{item.action}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

async function loadDashboardData(): Promise<DashboardData | null> {
  const supabase = createOptionalSupabaseAdminClient();
  if (!supabase) return null;

  const [posts, results, analysis, competitors, competitorPosts, referenceScreenshots] = await Promise.all([
    supabase
      .from("posts")
      .select("*, accounts(code,label,strategy)")
      .order("scheduled_at", { ascending: false })
      .limit(50),
    supabase.from("results").select("*").order("collected_at", { ascending: false }).limit(30),
    supabase.from("analysis").select("*").order("date", { ascending: false }).limit(8),
    supabase.from("competitors").select("*").order("account", { ascending: true }).limit(20),
    supabase
      .from("competitor_posts")
      .select("*, competitors(account, platform)")
      .order("impressions", { ascending: false })
      .limit(20),
    supabase
      .from("reference_screenshots")
      .select("*")
      .in("status", ["pending", "analyzing", "failed"])
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  const error = [posts.error, results.error, analysis.error, competitors.error, competitorPosts.error, referenceScreenshots.error].find(Boolean);

  return {
    posts: posts.data || [],
    results: results.data || [],
    analysis: analysis.data || [],
    competitors: competitors.data || [],
    competitorPosts: competitorPosts.data || [],
    referenceScreenshots: referenceScreenshots.data || [],
    error: error?.message
  };
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function KpiBars({ results }: { results: any[] }) {
  const rows = results.slice(0, 12).reverse();
  const max = Math.max(...rows.map((row) => Number(row.score || 0)), 1);

  if (rows.length === 0) return <p className="empty">KPIはまだありません。</p>;

  return (
    <div className="bars">
      {rows.map((row) => {
        const score = Number(row.score || 0);
        return (
          <div className="bar-row" key={row.id}>
            <span>{new Date(row.collected_at).toISOString().slice(5, 10)}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.max((score / max) * 100, 4)}%` }} />
            </div>
            <strong>{Math.round(score)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value).toISOString().slice(5, 10);
}

function formatNumber(value: number | string | null | undefined): string {
  return Number(value || 0).toLocaleString("ja-JP");
}
