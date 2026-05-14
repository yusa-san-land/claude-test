# 追加が必要な GitHub Actions ワークフロー

このディレクトリには、新しい Web アプリ「国土交通省ニュースウォッチャー」を完全に動作させるために
必要な GitHub Actions ワークフローが含まれています。

GitHub App の権限制約により Claude は `.github/workflows/` ディレクトリ配下に直接ファイルを追加できないため、
**手動で `.github/workflows/` に移動してください。**

## インストール手順

リポジトリのオーナー権限を持つアカウントで、ローカルマシンから以下を実行してください:

```bash
git pull
git mv workflows-to-add/update-news.yml .github/workflows/update-news.yml
git mv workflows-to-add/deploy-pages.yml .github/workflows/deploy-pages.yml
rm workflows-to-add/README.md
rmdir workflows-to-add
git add -A
git commit -m "chore(ci): install scheduled news updater and Pages deploy workflows"
git push
```

## ワークフローの内容

### `update-news.yml`

- 6 時間ごと (UTC 00:00 / 06:00 / 12:00 / 18:00) に `scripts/fetch-news.mjs` を実行
- 国土交通省のプレスリリース一覧を取得し、`ANTHROPIC_API_KEY` を使って要約 + カテゴリ分類
- 結果を `data/news.json` に保存し、変更があれば自動コミット & プッシュ
- 必要な Secret: `ANTHROPIC_API_KEY` (Repository Settings → Secrets and variables → Actions で設定済みであることを想定)

### `deploy-pages.yml`

- `main` ブランチに静的アセット (`index.html` / `app.js` / `styles.css` / `data/**`) が push されたときに GitHub Pages にデプロイ
- 必要な設定: Repository Settings → Pages → Source を **GitHub Actions** に切り替えてください

## 動作確認

1. 上記ワークフローを `.github/workflows/` に配置
2. Actions タブから「Update MLIT News」を `workflow_dispatch` で手動実行
3. `data/news.json` が更新されることを確認
4. Pages のデプロイが走り、`https://yusa-san-land.github.io/claude-test/` 等で表示されることを確認
