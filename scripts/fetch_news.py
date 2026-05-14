#!/usr/bin/env python3
"""
国土交通省プレスリリース収集・要約スクリプト

国土交通省公式サイトからプレスリリースを取得し、
Claude API で日本語要約を生成して data/news.json に保存する。
"""
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

import anthropic
import requests
from bs4 import BeautifulSoup

MLIT_BASE = "https://www.mlit.go.jp"
MLIT_PRESS_URL = f"{MLIT_BASE}/report/press/index.html"
DATA_FILE = "data/news.json"
MAX_STORED = 60
MAX_NEW_PER_RUN = 10

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; MLITNewsAggregator/1.0; +https://github.com)",
    "Accept-Language": "ja,en;q=0.8",
}

CATEGORY_KEYWORDS = {
    "道路・交通": ["道路", "高速道路", "交通", "渋滞", "ETC", "トンネル", "橋"],
    "鉄道": ["鉄道", "新幹線", "地下鉄", "リニア", "線路", "駅"],
    "航空": ["航空", "空港", "飛行", "ドローン", "UAV"],
    "港湾・海洋": ["港湾", "港", "海運", "船舶", "航路", "海洋"],
    "住宅・建設": ["住宅", "建設", "建築", "マンション", "耐震", "リフォーム", "不動産"],
    "都市・地域": ["都市", "まちづくり", "地域", "コンパクト", "再開発", "区画整理"],
    "河川・治水": ["河川", "治水", "洪水", "ダム", "砂防", "海岸"],
    "気象・防災": ["気象", "防災", "災害", "地震", "津波", "避難"],
    "観光": ["観光", "インバウンド", "旅行", "ツーリズム", "訪日"],
    "自動車": ["自動車", "車両", "EV", "電気自動車", "自動運転", "バス"],
    "水資源": ["水道", "下水", "水資源", "節水"],
    "国土政策": ["国土", "土地", "地価", "公示地価", "不動産登記"],
}


def guess_category(title: str) -> str:
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in title for kw in keywords):
            return cat
    return "その他"


def item_id(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:14]


def fetch(url: str, encoding: str = "utf-8", retries: int = 3) -> str:
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            r.encoding = encoding
            r.raise_for_status()
            return r.text
        except Exception as exc:
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt
            print(f"  Retry {attempt+1} after {wait}s ({exc})", file=sys.stderr)
            time.sleep(wait)


def parse_press_list(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    items = []

    date_re = re.compile(r"\d{4}[年/\-]\d{1,2}[月/\-]\d{1,2}")

    # Strategy 1: <dl> / <dt> + <dd> pairs common in MLIT layout
    for dl in soup.find_all("dl"):
        pairs = list(zip(dl.find_all("dt"), dl.find_all("dd")))
        for dt, dd in pairs:
            link = dd.find("a") or dt.find("a")
            if not link:
                continue
            date_m = date_re.search(dt.get_text())
            _add_item(items, link, date_m.group(0) if date_m else "")

    # Strategy 2: table rows
    if not items:
        for tr in soup.select("table tr"):
            cells = tr.find_all(["td", "th"])
            for cell in cells:
                link = cell.find("a")
                if link:
                    date_m = date_re.search(tr.get_text())
                    _add_item(items, link, date_m.group(0) if date_m else "")

    # Strategy 3: list items with embedded date text
    if not items:
        for li in soup.select("ul li, ol li"):
            link = li.find("a")
            if not link:
                continue
            date_m = date_re.search(li.get_text())
            _add_item(items, link, date_m.group(0) if date_m else "")

    return items


def _add_item(items: list, link, date_str: str):
    title = link.get_text(strip=True)
    href = link.get("href", "")
    if not href or len(title) < 6:
        return
    if href.startswith("http"):
        url = href
    elif href.startswith("/"):
        url = MLIT_BASE + href
    else:
        url = MLIT_BASE + "/" + href
    items.append({"title": title, "date_str": date_str, "url": url})


def parse_date(date_str: str) -> str:
    if not date_str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    m = re.search(r"(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})", date_str)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def fetch_article_text(url: str) -> str:
    try:
        html = fetch(url)
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup.select("nav, header, footer, script, style, .nav, .header, .footer, .sidebar"):
            tag.decompose()
        main = soup.select_one("main, #main, .main, article, #content, .content, .body")
        text = (main or soup.body or soup).get_text("\n", strip=True)
        # Collapse blank lines and limit length
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text[:3500]
    except Exception as e:
        print(f"  Could not fetch article: {e}", file=sys.stderr)
        return ""


def summarize(title: str, body: str, client: anthropic.Anthropic) -> str:
    content_part = f"\n\n本文抜粋:\n{body}" if body else ""
    prompt = (
        f"以下の国土交通省プレスリリースを日本語で3〜4文に要約してください。"
        f"施策の目的・内容・効果を中心に簡潔にまとめてください。\n\n"
        f"タイトル: {title}{content_part}"
    )
    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"  Claude API error: {e}", file=sys.stderr)
        return title


def load_existing() -> dict:
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"last_updated": "", "items": []}


def save(data: dict):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    print(f"Fetching MLIT press releases from {MLIT_PRESS_URL}")
    try:
        html = fetch(MLIT_PRESS_URL)
    except Exception as e:
        print(f"ERROR: Could not fetch press list: {e}", file=sys.stderr)
        sys.exit(1)

    press_list = parse_press_list(html)
    print(f"Parsed {len(press_list)} press release entries")

    if not press_list:
        print("WARNING: No entries parsed – page structure may have changed.", file=sys.stderr)

    data = load_existing()
    existing_ids = {item["id"] for item in data.get("items", [])}

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    client = anthropic.Anthropic(api_key=api_key) if api_key else None
    if not client:
        print("WARNING: ANTHROPIC_API_KEY not set – skipping summaries.", file=sys.stderr)

    new_items = []
    for entry in press_list:
        uid = item_id(entry["url"])
        if uid in existing_ids:
            continue

        print(f"  + {entry['title'][:70]}")

        article_body = ""
        if client:
            article_body = fetch_article_text(entry["url"])
            time.sleep(0.5)

        summary = summarize(entry["title"], article_body, client) if client else entry["title"]

        new_items.append({
            "id": uid,
            "date": parse_date(entry["date_str"]),
            "title": entry["title"],
            "url": entry["url"],
            "summary": summary,
            "category": guess_category(entry["title"]),
        })

        if len(new_items) >= MAX_NEW_PER_RUN:
            break

    print(f"Added {len(new_items)} new items")

    merged = new_items + data.get("items", [])
    data["items"] = merged[:MAX_STORED]
    data["last_updated"] = datetime.now(timezone.utc).isoformat()

    save(data)
    print(f"Saved {len(data['items'])} total items to {DATA_FILE}")


if __name__ == "__main__":
    main()
