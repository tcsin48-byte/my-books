/* 首页：书目搜索 + 分类筛选 + 正文检索 */
(function () {
  const listEl = document.getElementById("list");
  const emptyEl = document.getElementById("empty");
  const chipsEl = document.getElementById("filters");
  const qEl = document.getElementById("q");
  const formEl = document.getElementById("searchform");
  const bodyEl = document.getElementById("bodyhits");

  let DATA = { site: {}, books: [] };
  let query = "";
  let activeType = "全部";
  let INDEX = null;
  let indexLoading = false;
  let indexFailed = false;

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  function applySite() {
    const s = DATA.site || {};
    document.querySelectorAll("[data-site='author']").forEach((n) => (n.textContent = s.author || "我的书房"));
    document.querySelectorAll("[data-site='tagline']").forEach((n) => (n.textContent = s.tagline || ""));
    document.querySelectorAll("[data-site='intro']").forEach((n) => (n.textContent = s.intro || ""));
    document.querySelectorAll("[data-site='copyright']").forEach((n) => (n.textContent = s.copyright || ""));
    document.title = (s.author || "我的书房") + " · 电子书房";
  }

  function matches(book) {
    if (activeType !== "全部" && book.type !== activeType) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    const hay = [book.title, book.subtitle, book.type, book.year, book.lang, book.desc, (book.tags || []).join(" ")]
      .join(" ")
      .toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function cardHTML(b) {
    const badges = [];
    if (b.epub) badges.push('<span class="badge epub">EPUB</span>');
    if (b.pdf) badges.push('<span class="badge pdf">PDF</span>');
    if (b.type) badges.push('<span class="badge kind">' + esc(b.type) + "</span>");
    return (
      '<a class="card" href="book.html?id=' + encodeURIComponent(b.id) + '">' +
      '<div class="cover"><img loading="lazy" src="' + esc(b.cover) + '" alt="' + esc(b.title) + ' 封面"></div>' +
      '<div class="meta">' +
      "<h2>" + esc(b.title) + "</h2>" +
      '<div class="sub">' + esc([b.subtitle, b.year].filter(Boolean).join(" · ")) + "</div>" +
      '<div class="tags">' + badges.join("") + "</div>" +
      "</div></a>"
    );
  }

  function renderList() {
    const books = (DATA.books || [])
      .filter(matches)
      .sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")));
    listEl.innerHTML = books.map(cardHTML).join("");
    emptyEl.hidden = books.length > 0;
  }

  function renderFilters() {
    /* 栏目顺序以「站点信息 → 首页栏目」为准；书目里出现但没登记的，排在后面自动补上 */
    const configured = ((DATA.site && DATA.site.sections) || []).filter(Boolean);
    const present = (DATA.books || []).map((b) => b.type).filter(Boolean);
    const types = ["全部"].concat(configured, present.filter((t) => configured.indexOf(t) === -1));
    const uniq = types.filter((t, i) => types.indexOf(t) === i);
    if (uniq.indexOf(activeType) === -1) activeType = "全部";

    chipsEl.innerHTML = uniq
      .map(
        (t) =>
          '<button class="chip" type="button" aria-pressed="' + (t === activeType) + '" data-type="' + esc(t) + '">' + esc(t) + "</button>"
      )
      .join("");
    chipsEl.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeType = btn.dataset.type;
        chipsEl.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        renderList();
      });
    });
  }

  /* ── 正文检索 ── */
  function loadIndex() {
    if (INDEX || indexLoading || indexFailed) return Promise.resolve();
    indexLoading = true;
    return fetch("data/search-index.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : []))
      .then((json) => { INDEX = Array.isArray(json) ? json : []; })
      .catch(() => { indexFailed = true; })
      .then(() => { indexLoading = false; });
  }

  function snippet(text, q) {
    const flat = text.replace(/\s+/g, " ");
    const i = flat.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return "";
    const start = Math.max(0, i - 36);
    const end = Math.min(flat.length, i + q.length + 52);
    const piece = flat.slice(start, end);
    const rel = i - start;
    return (
      (start > 0 ? "…" : "") +
      esc(piece.slice(0, rel)) +
      "<mark>" + esc(piece.slice(rel, rel + q.length)) + "</mark>" +
      esc(piece.slice(rel + q.length)) +
      (end < flat.length ? "…" : "")
    );
  }

  function renderBodyHits() {
    if (!bodyEl) return;
    if (!query || query.length < 2 || !INDEX) {
      bodyEl.innerHTML = "";
      return;
    }
    const q = query.toLowerCase();
    const hits = [];
    INDEX.forEach((book) => {
      (book.sections || []).forEach((sec) => {
        if (hits.length >= 6) return;
        if ((sec.text || "").toLowerCase().indexOf(q) !== -1) {
          hits.push({
            id: book.id,
            title: book.title,
            href: sec.href,
            label: sec.label,
            html: snippet(sec.text, query),
          });
        }
      });
    });

    if (!hits.length) {
      bodyEl.innerHTML = '<p class="hits-empty">正文里没有找到「' + esc(query) + "」。</p>";
      return;
    }

    emptyEl.hidden = true;
    bodyEl.innerHTML =
      '<div class="hits-head">正文命中 ' + hits.length + " 处</div>" +
      hits
        .map(
          (h) =>
            '<a class="hit" href="book.html?id=' + encodeURIComponent(h.id) +
            "&href=" + encodeURIComponent(h.href) + '">' +
            '<span class="hit-where">' + esc(h.title) + " · " + esc(h.label) + "</span>" +
            '<span class="hit-text">' + h.html + "</span></a>"
        )
        .join("");
  }

  function runSearch() {
    query = qEl.value.trim();
    renderList();
    if (query.length >= 2) {
      loadIndex().then(renderBodyHits);
      renderBodyHits();
    } else {
      if (bodyEl) bodyEl.innerHTML = "";
    }
  }

  function watchSearch() {
    let timer;
    qEl.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(runSearch, 160);
    });
    formEl.addEventListener("submit", (e) => {
      e.preventDefault();
      runSearch();
    });
  }

  Promise.all([
    fetch("data/site.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("data/books.json", { cache: "no-cache" }).then((r) => r.json()),
  ])
    .then(([site, books]) => {
      DATA = { site: site || {}, books: Array.isArray(books) ? books : [] };
      applySite();
      renderFilters();
      renderList();
      watchSearch();
    })
    .catch(() => {
      listEl.innerHTML =
        '<p class="empty">书目数据读取失败。若你是直接双击打开 HTML，请改用本地服务器预览：<br>' +
        "<code>python3 -m http.server 8000</code> 然后访问 http://localhost:8000</p>";
    });
})();
