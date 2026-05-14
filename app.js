(function () {
  "use strict";

  const DATA_URL = "data/news.json";

  const el = {
    fetchedAt: document.getElementById("fetched-at"),
    count: document.getElementById("count"),
    sourceLink: document.getElementById("source-link"),
    search: document.getElementById("search"),
    category: document.getElementById("category"),
    importance: document.getElementById("importance"),
    list: document.getElementById("news-list"),
    status: document.getElementById("status"),
  };

  let state = {
    items: [],
    filtered: [],
  };

  function fmtDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function populateCategoryOptions(items) {
    const cats = Array.from(
      new Set(items.map((i) => i.category).filter(Boolean))
    ).sort();
    for (const c of cats) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      el.category.appendChild(opt);
    }
  }

  function applyFilters() {
    const q = el.search.value.trim().toLowerCase();
    const cat = el.category.value;
    const imp = el.importance.value;

    state.filtered = state.items.filter((it) => {
      if (cat && it.category !== cat) return false;
      if (imp && (it.importance || "normal") !== imp) return false;
      if (q) {
        const hay = ((it.title || "") + " " + (it.summary || "")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    render();
  }

  function render() {
    const items = state.filtered;
    el.list.innerHTML = "";

    if (items.length === 0) {
      el.status.textContent = "該当するニュースがありません。";
      el.status.classList.remove("error");
      return;
    }
    el.status.textContent = `${items.length} 件表示中`;
    el.status.classList.remove("error");

    const frag = document.createDocumentFragment();
    for (const it of items) {
      const li = document.createElement("li");
      li.className =
        "news-item" +
        (it.importance === "high" ? " importance-high" : "");

      const importanceBadge =
        it.importance === "high"
          ? '<span class="badge importance">重要</span>'
          : "";
      const categoryBadge = it.category
        ? `<span class="badge">${escapeHtml(it.category)}</span>`
        : "";

      li.innerHTML = `
        <div class="news-head">
          <span class="news-date">${escapeHtml(it.date || "")}</span>
          ${categoryBadge}
          ${importanceBadge}
        </div>
        <h2 class="news-title">
          <a href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(it.title)}
          </a>
        </h2>
        ${
          it.summary
            ? `<p class="news-summary">${escapeHtml(it.summary)}</p>`
            : ""
        }
      `;
      frag.appendChild(li);
    }
    el.list.appendChild(frag);
  }

  function sortByDateDesc(items) {
    return items.slice().sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });
  }

  async function load() {
    try {
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      el.fetchedAt.textContent = data.fetched_at
        ? fmtDate(data.fetched_at)
        : "未取得";
      el.count.textContent = String(data.count ?? (data.items?.length || 0));
      if (data.source) el.sourceLink.href = data.source;

      const items = sortByDateDesc(data.items || []);
      state.items = items;
      populateCategoryOptions(items);

      if (items.length === 0) {
        el.status.textContent =
          "まだニュースが取得されていません。スケジュール実行をお待ちください。";
        return;
      }

      applyFilters();
    } catch (err) {
      el.status.textContent = `読み込みに失敗しました: ${err.message}`;
      el.status.classList.add("error");
    }
  }

  el.search.addEventListener("input", applyFilters);
  el.category.addEventListener("change", applyFilters);
  el.importance.addEventListener("change", applyFilters);

  load();
})();
