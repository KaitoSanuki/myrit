# Cron 設計

## 推奨スケジュール

- 07:30 JST: `generate-posts`
- 07:35 JST: `notify-today`
- 5分ごと: `publish-due`
- 1時間ごと: `collect-kpis`
- 23:50 JST: `analyze-daily`
- 毎週月曜 07:00 JST: `import-competitors` と `analyze-weekly`

## Vercel Cron 例

```json
{
  "crons": [
    { "path": "/api/jobs/generate", "schedule": "30 22 * * *" },
    { "path": "/api/jobs/notify", "schedule": "35 22 * * *" },
    { "path": "/api/jobs/publish", "schedule": "*/5 * * * *" },
    { "path": "/api/jobs/collect-kpis", "schedule": "0 * * * *" },
    { "path": "/api/jobs/analyze", "schedule": "50 14 * * *" },
    { "path": "/api/jobs/weekly", "schedule": "0 22 * * 0" }
  ]
}
```

Vercel の Cron は UTC 指定です。

## GitHub Actions 例

`.github/workflows/growth-ops.yml` は、失敗メールが連発しないように手動実行だけにしています。GitHub Actions で定期実行する場合は、先に Repository secrets に `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を設定してください。

```yaml
name: growth-ops
on:
  schedule:
    - cron: "30 22 * * *"
    - cron: "*/5 * * * *"
  workflow_dispatch:

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run publish-due
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
          DRY_RUN_POSTING: "true"
```
