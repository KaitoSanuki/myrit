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
REFERENCE_AUTH_MAX_AGE_SECONDS=2592000
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

スクショから参考投稿を追加する場合:

1. ダッシュボードの「参考投稿を追加」にスクショだけ入れる
2. 未ログインなら管理パスワードで一度だけログインする
3. ローカルMacで `npm run analyze-references:codex`
4. `npm run analyze-weekly`
5. `npm run generate-posts:codex`

Codexが画像から、本文、リプ、表示数、いいね数、リポスト数、返信数、タグ、構造メモを読み取ります。

読み取る構造の例:

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
REFERENCE_AUTH_MAX_AGE_SECONDS=2592000
```

`REFERENCE_INGEST_SECRET` は毎回フォームに打つ鍵ではなく、管理ログイン用のパスワードとして使います。ログイン後はHttpOnly Cookieで認証されるため、スクショを貼るだけで登録できます。

スクショだけで登録すると、いったん「スクショ解析待ち」に入ります。ローカルMacで次を実行すると、Codex CLIが画像を読み取り、本文、リプ・続き、構造メモ、タグ、数値を自動で保存します。

```bash
npm run analyze-references:codex
```

1件だけ試す場合:

```bash
npm run analyze-references:codex -- 1
```

Codexが付けるタグの例:

```text
tier, reply_bait, curiosity_gap, list, save_cta, question_hook, authority, beginner
```

本文や構造メモを手入力した場合は、そのまま参考投稿として保存されます。

```bash
COMPETITOR_POSTS_JSON='[{"competitor":"english_tip","platform":"x","content":"初心者は1文だけ声に出すと続く","impressions":12000,"likes":20,"reposts":4,"replies":2,"posted_at":"2026-04-12T00:00:00.000Z"}]'
npm run import-competitors
npm run analyze-weekly
```

ファイルから取り込む場合:

```bash
npm run import-competitors -- data/competitor-posts.example.json
```

先に Supabase で `supabase/migrations/002_competitor_post_metrics.sql` を適用してください。
スクショ解析待ちを使う場合は `supabase/migrations/003_competitor_reference_inputs.sql` と `supabase/migrations/004_reference_screenshots.sql` も適用してください。

```bash
npm run add-competitor -- englishosaru x
npm run add-competitor -- Englishpandaa x
npm run analyze-references:codex
npm run analyze-weekly
```

手動・Threads用には JSON インポートも使えます。
