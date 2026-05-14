let allNews = [];
let currentCategory = null;

async function loadNews() {
    const container = document.getElementById('newsContainer');
    const lastUpdatedEl = document.getElementById('lastUpdated');

    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>情報を読み込み中...</p></div>';
    document.getElementById('emptyState').style.display = 'none';

    try {
        const res = await fetch('data/news.json?t=' + Date.now());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        allNews = data.items || [];

        if (data.last_updated) {
            const d = new Date(data.last_updated);
            lastUpdatedEl.textContent = '最終更新: ' + d.toLocaleString('ja-JP', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo'
            }) + ' JST';
        } else {
            lastUpdatedEl.textContent = '未更新';
        }

        buildCategoryFilters();
        renderNews();
    } catch (e) {
        container.innerHTML =
            '<div class="error-state">' +
            '<p>データの読み込みに失敗しました。しばらくしてから「更新」ボタンを押してください。</p>' +
            '<p>' + escHtml(e.message) + '</p>' +
            '</div>';
        lastUpdatedEl.textContent = 'エラー';
    }
}

function buildCategoryFilters() {
    const cats = [...new Set(allNews.map(n => n.category).filter(Boolean))].sort();
    const el = document.getElementById('categoryFilters');
    el.innerHTML = '<button class="filter-btn active" onclick="filterByCategory(null,this)">すべて</button>';
    cats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.textContent = cat;
        btn.onclick = function () { filterByCategory(cat, this); };
        el.appendChild(btn);
    });
}

function filterByCategory(cat, btn) {
    currentCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderNews();
}

function renderNews() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const container = document.getElementById('newsContainer');
    const emptyState = document.getElementById('emptyState');

    let items = allNews;

    if (currentCategory) {
        items = items.filter(n => n.category === currentCategory);
    }
    if (query) {
        items = items.filter(n =>
            n.title.toLowerCase().includes(query) ||
            (n.summary || '').toLowerCase().includes(query)
        );
    }

    if (allNews.length === 0) {
        container.innerHTML =
            '<div class="no-data-state">' +
            '<h3>データがまだありません</h3>' +
            '<p>GitHub Actions のワークフロー (<code>update-mlit-news</code>) を手動実行するか、<br>' +
            '次回の定期実行（6時間ごと）をお待ちください。</p>' +
            '</div>';
        emptyState.style.display = 'none';
        return;
    }

    if (items.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    const now = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;

    container.innerHTML = items.map(item => {
        const d = item.date ? new Date(item.date) : null;
        const isNew = d && (now - d.getTime()) < threeDays;
        const dateStr = d ? d.toLocaleDateString('ja-JP', {
            year: 'numeric', month: 'long', day: 'numeric'
        }) : '日付不明';

        return (
            '<article class="news-card">' +
            '<div class="card-header">' +
            '<span class="card-date">' + dateStr + '</span>' +
            (item.category ? '<span class="card-category">' + escHtml(item.category) + '</span>' : '') +
            '</div>' +
            '<div class="card-body">' +
            '<h2 class="card-title">' + escHtml(item.title) +
            (isNew ? '<span class="new-badge">NEW</span>' : '') +
            '</h2>' +
            (item.summary ? '<p class="card-summary">' + escHtml(item.summary) + '</p>' : '') +
            '<a href="' + escHtml(item.url) + '" target="_blank" rel="noopener" class="card-link">詳細を見る →</a>' +
            '</div>' +
            '</article>'
        );
    }).join('');
}

function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

loadNews();
