# English Growth Ops

英語学習アカウント向けの投稿生成、Discord確認、投稿キュー、KPI収集、PDCA分析、ダッシュボードの MVP です。

## 構成

- Next.js: ダッシュボードと Cron 用 API
- Supabase: 投稿、KPI、競合、分析、Discord バッチ管理
- Node.js scripts: ローカルまたは GitHub Actions 実行
- Discord Webhook: 投稿予定とエラー通知
- X / Threads adapters: `DRY_RUN_POSTING=true` では実投稿なし

## セットアップ

1. 依存関係を入れる

```bash
npm install
```

2. `.env.example` を参考に `.env.local` を作る

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
DISCORD_WEBHOOK_URL=
DRY_RUN_POSTING=true
POSTS_PER_DAY=5
REFERENCE_INGEST_SECRET=
```

3. Supabase に `supabase/migrations/001_initial_schema.sql` を適用し、必要なら `supabase/seed.sql` を流す

4. ダッシュボードを起動する

```bash
npm run dev
```

## 日次運用

投稿生成と Discord 通知:

```bash
npm run cron:morning
```

Codex CLI で投稿文を作る場合:

```bash
npm run generate-posts:codex
```

このコマンドはVercelではなく、Codex CLIにログイン済みのローカルMacで実行します。ローカルの `.env.local` に `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を入れてください。`CODEX_MODEL` や `CODEX_BIN` を指定すると、使うモデルやCLIパスを上書きできます。

競合を登録して改善へ反映する場合:

```bash
npm run add-competitor -- english_tip x
npm run add-competitor -- english_tip threads
npm run import-competitors -- data/competitor-posts.example.json
npm run analyze-weekly
npm run generate-posts:codex
```

`analyze-weekly` は競合投稿から勝ちパターン、負けパターン候補、次の仮説を `analysis` に保存します。次回の `generate-posts:codex` はその分析をプロンプトに含めて投稿案を作ります。

X の競合アカウントから、直近7日で一番インプレッションが多い投稿を自動取得する場合:

```bash
npm run collect-competitors:top -- 7
npm run analyze-weekly
npm run generate-posts:codex
```

この取得には `X_BEARER_TOKEN` が必要で、X API の料金が発生する可能性があります。無料運用を優先する場合は使わず、JSONインポートで競合投稿を入れます。Threads の競合投稿も、初期MVPではJSONインポートで登録します。
最初は `X_COMPETITOR_MAX_ACCOUNTS=10`、`X_COMPETITOR_TIMELINE_MAX_PAGES=3` のまま少量で試してください。実行結果に `estimated_x_api_requests` と `posts_seen` が出ます。

スクショから参考投稿を追加する場合:

1. ダッシュボードの「参考投稿を追加」にスクショ、本文、リプ、構造メモを入れる
2. 登録キーに `REFERENCE_INGEST_SECRET` または `CRON_SECRET` を入れる
3. `npm run analyze-weekly`
4. `npm run generate-posts:codex`

例の構造メモ:

```text
Tier表でAを空欄にし、上位の答えをリプに置いてクリックを誘う。本文は学習者が知りたい分類に絞る。
```

投稿実行、KPI収集、日次分析:

```bash
npm run cron:worker
```

個別実行:

```bash
npm run generate-posts
npm run notify-today
npm run publish-due
npm run collect-kpis
npm run analyze-daily
```

## HTTP Cron

`Authorization: Bearer <CRON_SECRET>` か `?secret=<CRON_SECRET>` で呼びます。

- `POST /api/jobs/generate`
- `POST /api/jobs/notify`
- `POST /api/jobs/publish`
- `POST /api/jobs/collect-kpis`
- `POST /api/jobs/analyze`
- `POST /api/jobs/weekly`
- `POST /api/jobs/collect-competitors`
- `POST /api/references`
- `POST /api/discord/reference`

Vercel は `vercel.json`、GitHub Actions は `.github/workflows/growth-ops.yml` に初期スケジュールを入れています。

## Discord stop

Webhook だけでは Discord の返信やリアクションを読み取れません。`stop 2` や ❌ リアクションを使う場合は、Discord Bot やワークフロー側で次の API に転送してください。

```bash
POST /api/discord/stop
Authorization: Bearer <DISCORD_STOP_SECRET>

{
  "command": "stop 2",
  "batchId": "optional-discord-batch-id"
}
```

`batchId` を省略すると、最新の Discord 通知バッチから番号を解決します。

## 本番投稿

初期状態は `DRY_RUN_POSTING=true` です。実投稿に切り替える前に、API審査、投稿権限、利用規約、レート制限を確認してください。

X:

```bash
DRY_RUN_POSTING=false
X_USER_ACCESS_TOKEN=
X_BEARER_TOKEN=
```

Threads:

```bash
DRY_RUN_POSTING=false
THREADS_ACCESS_TOKEN=
THREADS_USER_ID=me
THREADS_API_BASE_URL=https://graph.threads.net
```

## 競合投稿

無料運用では、X/Threadsをブラウザで確認して、週1回だけ上位投稿をダッシュボードまたはJSONで `competitor_posts` に保存します。

ダッシュボードから登録する場合:

```bash
REFERENCE_INGEST_SECRET=好きな長い文字列
```

本文だけでなく、リプ・続き、構造メモ、タグも保存できます。たとえば `tier, reply_bait, curiosity_gap` のようにタグを入れると、次回の生成で構造として参照されます。

```bash
COMPETITOR_POSTS_JSON='[{"competitor":"english_tip","platform":"x","content":"初心者は1文だけ声に出すと続く","impressions":12000,"likes":20,"reposts":4,"replies":2,"posted_at":"2026-04-12T00:00:00.000Z"}]'
npm run import-competitors
npm run analyze-weekly
```

ファイルから取り込む場合:

```bash
npm run import-competitors -- data/competitor-posts.example.json
```

X API を使う有料・自動取得では、登録済みアカウントを見に行って直近7日でインプレッション最大の投稿を1件ずつ保存できます。

先に Supabase で `supabase/migrations/002_competitor_post_metrics.sql` を適用してください。

```bash
npm run add-competitor -- englishosaru x
npm run add-competitor -- Englishpandaa x
npm run collect-competitors:top -- 7 10 3
npm run analyze-weekly
```

`.env.local` の例:

```bash
X_BEARER_TOKEN=
COMPETITOR_COLLECT_DAYS=7
X_COMPETITOR_MAX_ACCOUNTS=10
X_COMPETITOR_TIMELINE_MAX_PAGES=3
```

`collect-competitors:top -- 7 10 3` は、過去7日、最大10アカウント、各アカウント最大3ページを取得します。

HTTP で実行する場合:

```bash
curl -X POST "https://myrit.vercel.app/api/jobs/collect-competitors?days=7&secret=$CRON_SECRET"
```

手動・Threads用には JSON インポートも使えます。
