# 国土交通省ニュースウォッチャー

国土交通省 (MLIT) のプレスリリースを定期的に取得し、AI による要約とカテゴリ分類で
素早く把握できる静的 Web アプリケーションです。

## 構成

```
.
├── index.html              # トップページ (静的サイト)
├── app.js                  # ニュース一覧 UI ロジック
├── styles.css              # スタイル
├── data/
│   └── news.json           # 取得済みプレスリリース (自動更新)
├── scripts/
│   └── fetch-news.mjs      # プレスリリース取得 + AI 要約スクリプト
├── workflows-to-add/       # 手動で .github/workflows/ に配置する CI 定義
│   ├── update-news.yml     # 6 時間ごとに news.json を更新
│   └── deploy-pages.yml    # GitHub Pages に自動デプロイ
└── archive/
    └── calculator/         # 旧電卓アプリ (退避済み)
```

## 動作の仕組み

1. `update-news.yml` (cron) が `scripts/fetch-news.mjs` を実行
2. スクリプトは `https://www.mlit.go.jp/report/press/index.html` をフェッチし、
   プレスリリース一覧 (日付・タイトル・URL) を抽出
3. `ANTHROPIC_API_KEY` が設定されていれば、Claude Haiku で各記事を要約 + カテゴリ分類 + 重要度判定
4. 結果を `data/news.json` に保存し、変更があれば自動コミット
5. `deploy-pages.yml` が `main` の更新を検知し、GitHub Pages に自動デプロイ

## ローカル動作確認

```bash
# ニュース取得 (要 ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY=sk-ant-...
node scripts/fetch-news.mjs

# プレビュー
python3 -m http.server 8000
# http://localhost:8000 をブラウザで開く
```

## 初回セットアップ

GitHub App の権限制約により、CI ワークフローは手動で配置していただく必要があります。
詳細は [`workflows-to-add/README.md`](workflows-to-add/README.md) を参照してください。

## 旧アプリ

以前 `main` ブランチで公開されていた電卓アプリは [`archive/calculator/`](archive/calculator/) に退避済みです。

## ライセンス / 注意事項

本サイトは国土交通省の公開情報を参照しています。要約は AI による自動生成であり、
正確性は保証されません。重要な意思決定の前に必ず一次情報源で内容をご確認ください。
