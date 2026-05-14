#!/usr/bin/env node
// 国土交通省 (MLIT) のプレスリリースを取得し、Anthropic API で要約して
// data/news.json に保存するスクリプト。
//
// 必要な環境変数:
//   ANTHROPIC_API_KEY  - Anthropic API キー (任意。未指定時は要約をスキップ)
//
// 実行: node scripts/fetch-news.mjs

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DATA_DIR = join(REPO_ROOT, "data");
const OUTPUT_FILE = join(DATA_DIR, "news.json");

const MLIT_PRESS_INDEX = "https://www.mlit.go.jp/report/press/index.html";
const MLIT_BASE = "https://www.mlit.go.jp";

const MAX_ITEMS = 30;
const SUMMARIZE_TOP_N = 15;
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

const UA =
  "Mozilla/5.0 (compatible; MLIT-News-Watcher/1.0; +https://github.com/yusa-san-land/claude-test)";

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  // MLIT のページは UTF-8 で配信されているが、念のため明示
  return new TextDecoder("utf-8").decode(buf);
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s) {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function absoluteUrl(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("//")) return "https:" + href;
  if (href.startsWith("/")) return MLIT_BASE + href;
  return new URL(href, MLIT_PRESS_INDEX).toString();
}

// MLIT のプレスリリース一覧から (date, title, url) を抽出する。
// ページ構造は時期によって若干変わるため、複数のパターンを試す。
function parsePressReleases(html) {
  const items = [];
  const seen = new Set();

  // パターン: <a href="...">タイトル</a> の近傍に日付 (YYYY年M月D日 / YYYY/MM/DD など)
  const linkRe =
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const dateRe =
    /(20\d{2})\s*[年\/\-\.]\s*(\d{1,2})\s*[月\/\-\.]\s*(\d{1,2})/;

  // 一覧の各行はだいたい "日付 ... <a>タイトル</a>" の形をしている。
  // 行単位に分割して走査する。
  const lines = html.split(/<\/?(?:li|tr|dt|dd|p|br\s*\/?)>/i);
  for (const line of lines) {
    const dateMatch = line.match(dateRe);
    if (!dateMatch) continue;
    const [, y, m, d] = dateMatch;
    const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    linkRe.lastIndex = 0;
    let lm;
    while ((lm = linkRe.exec(line)) !== null) {
      const href = absoluteUrl(lm[1]);
      const title = stripTags(lm[2]);
      if (!href || !title) continue;
      if (title.length < 4) continue;
      // ナビゲーションリンクなどを除外
      if (/^(トップ|ホーム|前へ|次へ|一覧|サイトマップ|english)$/i.test(title)) continue;
      // プレスリリース系のリンクに絞る
      if (!/mlit\.go\.jp/.test(href)) continue;
      if (/index\.html?$/i.test(href)) continue;

      const key = href + "|" + title;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({ date, title, url: href });
      if (items.length >= MAX_ITEMS) break;
    }
    if (items.length >= MAX_ITEMS) break;
  }

  return items;
}

async function summarizeWithAnthropic(apiKey, items) {
  if (!apiKey) return items;

  const toSummarize = items.slice(0, SUMMARIZE_TOP_N);
  const numbered = toSummarize
    .map((it, i) => `${i + 1}. (${it.date}) ${it.title}`)
    .join("\n");

  const prompt = `あなたは国土交通省のプレスリリースを分かりやすく解説するアナリストです。
以下は最近の国土交通省プレスリリースのタイトル一覧です。
それぞれについて、以下を出力してください:

- summary: タイトルから推測できる内容を、一般読者向けに 60〜120 字の日本語で要約
- category: 次のいずれかから最も近いもの ["道路・交通", "鉄道", "航空", "海事・港湾", "住宅・建築", "都市・地域", "防災・気象", "観光", "物流", "DX・データ", "国際", "その他"]
- importance: "high" | "normal"  (国民生活・経済への影響が大きそうなら high)

必ず JSON のみを返してください。形式:
{
  "items": [
    { "index": 1, "summary": "...", "category": "...", "importance": "..." },
    ...
  ]
}

タイトル一覧:
${numbered}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Anthropic API error ${res.status}: ${text}`);
    return items;
  }

  const json = await res.json();
  const text = json?.content?.[0]?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error("Failed to parse Anthropic response as JSON:", text);
    return items;
  }

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    console.error("JSON parse error:", e.message);
    return items;
  }

  const byIndex = new Map();
  for (const r of parsed.items ?? []) {
    if (typeof r.index === "number") byIndex.set(r.index, r);
  }

  return items.map((it, i) => {
    const r = byIndex.get(i + 1);
    if (!r) return it;
    return {
      ...it,
      summary: r.summary,
      category: r.category,
      importance: r.importance,
    };
  });
}

async function main() {
  console.log(`Fetching ${MLIT_PRESS_INDEX} ...`);
  const html = await fetchText(MLIT_PRESS_INDEX);
  const parsed = parsePressReleases(html);
  console.log(`Parsed ${parsed.length} press release entries.`);

  if (parsed.length === 0) {
    // 既存ファイルがある場合は壊さないため、上書きしない
    console.warn("No items parsed; keeping existing data/news.json if present.");
    try {
      await readFile(OUTPUT_FILE, "utf-8");
      console.warn("Existing file kept. Exiting without changes.");
      return;
    } catch {
      // 既存ファイルが無い場合は空のデータを書き込む
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not set; skipping summarization.");
  }

  const enriched = await summarizeWithAnthropic(apiKey, parsed);

  const output = {
    source: MLIT_PRESS_INDEX,
    fetched_at: new Date().toISOString(),
    summarized: Boolean(apiKey),
    count: enriched.length,
    items: enriched,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${OUTPUT_FILE} (${enriched.length} items).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
