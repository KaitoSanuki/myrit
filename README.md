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

初期MVPではスクレイピング処理を差し替えやすいように、JSON インポートを用意しています。

```bash
COMPETITOR_POSTS_JSON='[{"competitor":"english_tip","platform":"x","content":"初心者は1文だけ声に出すと続く","likes":20,"reposts":4,"replies":2,"posted_at":"2026-04-12T00:00:00.000Z"}]'
npm run import-competitors
npm run analyze-weekly
```

ファイルから取り込む場合:

```bash
npm run import-competitors -- data/competitor-posts.example.json
```
