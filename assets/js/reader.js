/* 阅读页：书籍详情 + EPUB 在线阅读器（epub.js）/ PDF 内嵌
   包含：阅读进度记忆、选中文字生成分享卡片 */
(function () {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const startHref = params.get("href");
  const detailEl = document.getElementById("detail");

  let SITE_AUTHOR = "";
  fetch("data/site.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((s) => { SITE_AUTHOR = (s && s.author) || ""; })
    .catch(() => {});

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const fmtSize = (b) => {
    if (!b) return "";
    const n = Number(b);
    if (!n) return "";
    return n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";
  };

  /* ── 本地进度存储 ── */
  const pKey = (bid) => "wb.progress." + bid;
  function loadProgress(bid) {
    try {
      const raw = localStorage.getItem(pKey(bid));
      const obj = raw ? JSON.parse(raw) : null;
      return obj && obj.cfi ? obj : null;
    } catch (e) {
      return null;
    }
  }
  function saveProgress(bid, data) {
    try {
      localStorage.setItem(pKey(bid), JSON.stringify(data));
    } catch (e) {}
  }

  fetch("data/books.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((books) => {
      const book = (Array.isArray(books) ? books : []).find((b) => b.id === id);
      if (!book) {
        detailEl.innerHTML = '<p class="empty">找不到这本书。<a href="index.html">回到书目</a></p>';
        return;
      }
      document.title = book.title + " · 电子书房";
      renderDetail(book);
      bindReader(book);
    })
    .catch(() => {
      detailEl.innerHTML = '<p class="empty">数据读取失败，请通过本地服务器或线上地址访问。</p>';
    });

  function renderDetail(b) {
    const meta = [
      b.type,
      b.year,
      b.lang,
      b.size ? fmtSize(b.size) : "",
      b.updated ? "更新于 " + b.updated : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const saved = b.epub ? loadProgress(b.id) : null;
    const btns = [];
    if (b.epub || b.pdf) {
      const label = saved ? "继续阅读 · " + Math.round((saved.pct || 0) * 100) + "%" : "在线阅读";
      btns.push('<button class="btn" id="openReader">' + label + "</button>");
    }
    if (b.epub) btns.push('<a class="btn ghost" href="' + esc(b.epub) + '" download>下载 EPUB</a>');
    if (b.pdf) btns.push('<a class="btn ghost" href="' + esc(b.pdf) + '" download>下载 PDF</a>');

    detailEl.innerHTML =
      '<div class="detail">' +
      '<div class="cover-lg"><img src="' + esc(b.cover) + '" alt="' + esc(b.title) + ' 封面"></div>' +
      "<div>" +
      "<h1>" + esc(b.title) + "</h1>" +
      '<div class="byline">' + esc([b.subtitle, meta].filter(Boolean).join(" — ")) + "</div>" +
      '<p class="desc">' + esc(b.desc) + "</p>" +
      '<div class="actions">' + btns.join("") + "</div>" +
      (saved
        ? '<p class="resume-hint">上次读到 ' +
          Math.round((saved.pct || 0) * 100) +
          "%（" +
          esc(saved.at || "") +
          '）<button type="button" class="linkish" id="resetProgress">从头开始</button></p>'
        : "") +
      "</div></div>";

    const reset = document.getElementById("resetProgress");
    if (reset) {
      reset.addEventListener("click", () => {
        try { localStorage.removeItem(pKey(b.id)); } catch (e) {}
        reset.parentElement.textContent = "已清除进度，下次打开会从第一页开始。";
      });
    }
  }

  function bindReader(b) {
    const openBtn = document.getElementById("openReader");
    if (!openBtn) return;

    const readerEl = document.getElementById("reader");
    const viewerEl = document.getElementById("viewer");
    const tocEl = document.getElementById("toc");
    const barTitle = document.getElementById("readerTitle");
    const progressBar = document.querySelector("#readerProgress i");
    const settingsEl = document.getElementById("settings");
    const drawerEl = document.getElementById("tocDrawer");
    const scrimEl = document.getElementById("scrim");

    barTitle.textContent = b.title;

    const wakeLock = { sentinel: null };
    let started = false;
    async function keepAwake() {
      try {
        if ("wakeLock" in navigator) wakeLock.sentinel = await navigator.wakeLock.request("screen");
      } catch (e) {}
    }

    function openReader() {
      readerEl.classList.add("open");
      document.body.style.overflow = "hidden";
      keepAwake();
      if (started) return;
      started = true;
      if (b.epub) startEpub(b.epub);
      else startPdf(b.pdf);
    }

    function closeReader() {
      readerEl.classList.remove("open");
      document.body.style.overflow = "";
      closeDrawer();
      hideQuoteBtn();
      if (wakeLock.sentinel) { wakeLock.sentinel.release().catch(() => {}); wakeLock.sentinel = null; }
    }

    function openDrawer() { drawerEl.classList.add("open"); scrimEl.classList.add("open"); }
    function closeDrawer() { drawerEl.classList.remove("open"); scrimEl.classList.remove("open"); }

    openBtn.addEventListener("click", openReader);
    document.getElementById("closeReader").addEventListener("click", closeReader);
    document.getElementById("tocBtn").addEventListener("click", openDrawer);
    scrimEl.addEventListener("click", () => { closeDrawer(); settingsEl.classList.remove("open"); });

    document.getElementById("settingsBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      settingsEl.classList.toggle("open");
    });

    /* 从搜索结果跳进来：直接打开阅读器 */
    if (startHref) setTimeout(openReader, 80);

    /* ── PDF：直接用浏览器内嵌查看器 ── */
    function startPdf(url) {
      const prevBtn = document.getElementById("prevPage");
      const nextBtn = document.getElementById("nextPage");
      if (prevBtn) prevBtn.hidden = true;
      if (nextBtn) nextBtn.hidden = true;
      viewerEl.innerHTML = '<iframe class="pdf-frame" src="' + esc(url) + '#view=FitH" title="PDF 阅读器"></iframe>';
      progressBar.style.width = "100%";
      tocEl.innerHTML = '<p style="padding:10px;color:#6b7169;font-size:13px">PDF 为原版排版，可用右上角按钮下载到本地阅读。</p>';
    }

    /* ── EPUB：epub.js ── */
    function startEpub(url) {
      viewerEl.innerHTML = "";
      progressBar.style.width = "0%";

      function fail(msg) {
        viewerEl.innerHTML =
          "<div style='padding:32px 24px;max-width:540px;margin:0 auto;color:#3a4038;line-height:1.8'>" +
          "<p style='font-family:var(--serif);font-size:17px;margin:0 0 10px'>这本书暂时无法在线阅读</p>" +
          "<p style='color:#6b7169;font-size:13px;margin:0 0 18px;word-break:break-all'>" +
          esc(String(msg || "")) +
          "</p>" +
          "<p><a href='" + esc(url) + "' download style='color:#2f4a3c;text-decoration:underline'>下载 EPUB 到本地阅读</a></p>" +
          "</div>";
      }

      /* epub.js 只负责排版，解压 zip 交给 JSZip，两者缺一不可 */
      if (typeof ePub === "undefined" || typeof JSZip === "undefined") {
        fail("阅读组件未加载：assets/vendor/jszip.min.js 与 epub.min.js 需同时存在。");
        return;
      }

      const book = ePub(url);

      /* 尺寸必须用 clientWidth/clientHeight 的整数：
         getBoundingClientRect 带小数，取整后 iframe 可能比容器大零点几像素，
         多出一条滚动条就会把列宽挤窄 —— 这是“翻页错位、来回跳”的常见原因 */
      function viewerSize() {
        const w = viewerEl.clientWidth || window.innerWidth;
        const h = viewerEl.clientHeight || window.innerHeight - 90;
        return { width: Math.max(280, Math.floor(w)), height: Math.max(280, Math.floor(h)) };
      }
      const vs = viewerSize();
      let curW = vs.width;
      let curH = vs.height;

      const rendition = book.renderTo("viewer", {
        width: vs.width,
        height: vs.height,
        flow: "paginated",
        spread: "none",
        allowScriptedContent: true,
      });

      /* 一次点击/滑动只翻一页：连点两次位移叠加就会看起来“跳页” */
      let lastTurn = 0;
      let pct = 0;
      function turn(dir) {
        const now = Date.now();
        if (now - lastTurn < 400) return;
        const total = book.locations.length();
        if (total) {
          if (dir > 0 && pct > 0.9999) return;
          if (dir < 0 && pct <= 0) return;
        }
        lastTurn = now;
        if (dir > 0) rendition.next();
        else rendition.prev();
      }

      /* 只在尺寸真的变了才重排（转屏 / 改窗口）。
         原来监听 resize 无条件 resize，手机上地址栏收放都会触发，
         重排后当前页位置被重置 → 读起来就像在几页之间来回跳 */
      let rzTimer = null;
      function syncSize() {
        if (!readerEl.classList.contains("open")) return;
        if (Date.now() - lastTurn < 600) { rzTimer = setTimeout(syncSize, 400); return; }
        const w = viewerEl.clientWidth;
        const h = viewerEl.clientHeight;
        if (!w || !h) return;
        if (Math.abs(w - curW) < 8 && Math.abs(h - curH) < 8) return;
        let cfi = null;
        try { cfi = rendition.currentLocation().start.cfi; } catch (e) {}
        curW = Math.floor(w);
        curH = Math.floor(h);
        rendition.resize(curW, curH);
        if (cfi) { try { rendition.display(cfi); } catch (e) {} }
      }
      window.addEventListener("resize", () => {
        clearTimeout(rzTimer);
        rzTimer = setTimeout(syncSize, 450);
      });
      window.addEventListener("orientationchange", () => {
        clearTimeout(rzTimer);
        rzTimer = setTimeout(syncSize, 700);
      });

      const chapterTitles = {};
      let currentTitle = "";

      /* 目录 */
      book.loaded.navigation.then((nav) => {
        const walk = (items, depth) => {
          items.forEach((item) => {
            const label = (item.label || "").trim();
            chapterTitles[String(item.href).split("#")[0]] = label;
            rows.push(
              '<a class="' + (depth ? "sub" : "") + '" href="#" data-href="' + esc(item.href) + '">' + esc(label) + "</a>"
            );
            if (item.subitems && item.subitems.length) walk(item.subitems, depth + 1);
          });
        };
        const rows = [];
        walk(nav.toc || [], 0);
        tocEl.innerHTML = "<h3>目录</h3>" + rows.join("");
        tocEl.querySelectorAll("a[data-href]").forEach((a) => {
          a.addEventListener("click", (e) => {
            e.preventDefault();
            rendition.display(a.dataset.href);
            closeDrawer();
          });
        });
      });

      /* 进度与页数 */
      const pageInfoEl = document.getElementById("pageInfo");
      function setPageInfo(txt) {
        if (pageInfoEl) pageInfoEl.textContent = txt || "";
      }
      function updateProgress() {
        const loc = rendition.currentLocation();
        if (!loc || !loc.start) return;
        try {
          pct = book.locations.percentageFromCfi(loc.start.cfi) || 0;
        } catch (e) { pct = 0; }
        progressBar.style.width = Math.max(0, Math.min(1, pct)) * 100 + "%";

        const total = book.locations.length();
        if (total) {
          let idx = -1;
          try { idx = book.locations.locationFromCfi(loc.start.cfi); } catch (e) {}
          if (idx >= 0) setPageInfo("第 " + (idx + 1) + " / " + total + " 页");
        }

        const href = String(loc.start.href || "").split("#")[0];
        currentTitle = chapterTitles[href] || currentTitle;
      }

      book.opened.catch((e) => fail(e && e.message));

      let saveTimer = null;
      rendition.on("relocated", (loc) => {
        updateProgress();
        if (!loc || !loc.start) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveProgress(b.id, {
            cfi: loc.start.cfi,
            pct: pct,
            at: new Date().toISOString().slice(0, 10),
          });
        }, 900);
      });

      /* 点击只前进：整屏轻点翻下一页。
         上一页交给左侧 ‹ 按钮、向右滑动、← 键 —— 不再用“点左半边回退”，
         手指稍有偏差就退回上一页，正是“来回跳”的来源 */
      let suppressTapUntil = 0;
      rendition.hooks.content.register((contents) => {
        const doc = contents.document;
        const win = contents.window;

        doc.addEventListener("click", (e) => {
          if (Date.now() < suppressTapUntil) return;
          const sel = win && win.getSelection ? win.getSelection() : null;
          if (sel && String(sel).trim()) return;
          /* 点书里的链接（目录、注释）不当作翻页 */
          const t = e.target;
          if (t && t.closest && t.closest("a")) return;
          hideQuoteBtn();
          turn(1);
        });

        doc.addEventListener("mouseup", () => {
          const sel = win && win.getSelection ? String(win.getSelection()).trim() : "";
          if (sel.length > 4) setTimeout(showQuoteBtn, 40);
        });

        /* 平板、手机：左右滑动翻页 */
        let sx = 0, sy = 0, st = 0;
        doc.addEventListener("touchstart", (e) => {
          if (e.touches.length !== 1) return;
          sx = e.touches[0].clientX;
          sy = e.touches[0].clientY;
          st = Date.now();
        }, { passive: true });

        doc.addEventListener("touchend", (e) => {
          if (!e.changedTouches || !e.changedTouches.length) return;
          const dx = e.changedTouches[0].clientX - sx;
          const dy = e.changedTouches[0].clientY - sy;
          if (Date.now() - st > 800) return;
          if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          suppressTapUntil = Date.now() + 500;
          turn(dx < 0 ? 1 : -1);
        }, { passive: true });
      });

      /* 左右翻页按钮：点击区域出问题时仍有明确入口 */
      const prevBtn = document.getElementById("prevPage");
      const nextBtn = document.getElementById("nextPage");
      if (prevBtn) {
        prevBtn.hidden = false;
        prevBtn.addEventListener("click", (e) => { e.stopPropagation(); turn(-1); });
      }
      if (nextBtn) {
        nextBtn.hidden = false;
        nextBtn.addEventListener("click", (e) => { e.stopPropagation(); turn(1); });
      }

      /* 选中文字 → 生成卡片 */
      let lastQuote = "";
      rendition.on("selected", (cfiRange) => {
        try {
          const range = rendition.getRange(cfiRange);
          lastQuote = range ? String(range.toString()).trim() : "";
        } catch (e) {
          lastQuote = "";
        }
        if (lastQuote.length > 4) setTimeout(showQuoteBtn, 40);
      });

      /* 键盘 */
      function onKey(e) {
        if (!readerEl.classList.contains("open")) return;
        if (e.key === "ArrowRight" || e.key === " ") turn(1);
        if (e.key === "ArrowLeft") turn(-1);
        if (e.key === "Escape") closeReader();
      }
      document.addEventListener("keydown", onKey);
      /* 焦点在正文 iframe 里时，父页面的 keydown 收不到，单独绑一份 */
      rendition.hooks.content.register((contents) => {
        contents.document.addEventListener("keydown", (e) => {
          if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); turn(1); }
          if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); turn(-1); }
        });
      });

      /* 设置：字号与主题 */
      let fontPct = 100;
      const THEMES = {
        paper: "html, body { background:#fdfbf4 !important; color:#1f2320 !important; } a { color:#2f4a3c !important; }",
        night: "html, body { background:#16181a !important; color:#c3c8c3 !important; } a { color:#8fb6a1 !important; }",
        plain: "html, body { background:#ffffff !important; color:#111 !important; }",
      };
      rendition.themes.register("paper", THEMES.paper);
      rendition.themes.register("night", THEMES.night);
      rendition.themes.register("plain", THEMES.plain);
      rendition.themes.select("paper");
      rendition.themes.fontSize(fontPct + "%");

      /* 先算好全书分页（locations），再显示第一屏。
         以前是边显示边 generate，两者抢同一份排版，翻页时机、页数都会乱 */
      const saved = loadProgress(b.id);
      const target = startHref || (saved && saved.cfi) || null;

      function firstDisplay() {
        const p = target ? rendition.display(target) : rendition.display();
        return p.then(() => updateProgress())
          .catch(() => rendition.display().then(updateProgress));
      }

      book.ready
        .then(() => book.locations.generate(800))
        .catch(() => null)
        .then(firstDisplay)
        .catch((e) => fail(e && e.message));

      /* 兜底：15 秒还没渲染出页面，就给出可操作的提示，别留一片空白 */
      setTimeout(() => {
        if (!viewerEl.querySelector("iframe")) fail("加载超时，可能是网络较慢或文件较大。");
      }, 15000);

      document.querySelectorAll("[data-font]").forEach((btn) => {
        btn.addEventListener("click", () => {
          fontPct = btn.dataset.font === "up" ? Math.min(180, fontPct + 10) : Math.max(70, fontPct - 10);
          rendition.themes.fontSize(fontPct + "%");
        });
      });

      document.querySelectorAll("[data-theme]").forEach((btn) => {
        btn.addEventListener("click", () => {
          rendition.themes.select(btn.dataset.theme);
          document.querySelectorAll("[data-theme]").forEach((x) =>
            x.setAttribute("aria-pressed", String(x === btn))
          );
        });
      });

      /* ── 金句卡片 ── */
      function showQuoteBtn() {
        if (!lastQuote) return;
        quoteBtn.classList.add("show");
        clearTimeout(quoteBtn._t);
        quoteBtn._t = setTimeout(hideQuoteBtn, 8000);
      }

      quoteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        hideQuoteBtn();
        openQuoteModal(lastQuote, currentTitle);
      });
    }
  }

  /* ── 卡片绘制与弹层（与 epub 实例无关） ── */
  const quoteBtn = document.getElementById("quoteBtn");
  const quoteModal = document.getElementById("quoteModal");
  const quoteCanvas = document.getElementById("quoteCanvas");
  let quoteMeta = { text: "", chapter: "" };

  function hideQuoteBtn() {
    quoteBtn.classList.remove("show");
    clearTimeout(quoteBtn._t);
  }

  const STYLES = {
    paper: { bg: "#f4efe1", fg: "#1f2320", accent: "#2f4a3c", muted: "#6b7169" },
    ink: { bg: "#2f4a3c", fg: "#f4efe1", accent: "#c8b992", muted: "#a9bcae" },
    dusk: { bg: "#e7d8bf", fg: "#3a2c22", accent: "#9b4a35", muted: "#7a6252" },
  };

  function wrap(ctx, text, maxW) {
    const lines = [];
    let line = "";
    for (const ch of text) {
      if (ch === "\n") { lines.push(line); line = ""; continue; }
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = ch; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawCard(styleName) {
    const st = STYLES[styleName] || STYLES.paper;
    const W = 1080, H = 1440, PAD = 110;
    quoteCanvas.width = W;
    quoteCanvas.height = H;
    const ctx = quoteCanvas.getContext("2d");

    ctx.fillStyle = st.bg;
    ctx.fillRect(0, 0, W, H);

    // 边框
    ctx.strokeStyle = st.accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.strokeRect(48, 48, W - 96, H - 96);
    ctx.globalAlpha = 1;

    // 顶部书名
    ctx.fillStyle = st.muted;
    ctx.font = '30px "Noto Serif SC", "Songti SC", serif';
    ctx.textAlign = "left";
    const bookName = quoteMeta.book || "";
    ctx.fillText(bookName, PAD, 170);

    // 引号装饰
    ctx.fillStyle = st.accent;
    ctx.globalAlpha = 0.22;
    ctx.font = '190px Georgia, serif';
    ctx.fillText("“", PAD - 12, 360);
    ctx.globalAlpha = 1;

    // 正文
    let size = 52;
    let lines = [];
    const maxTextW = W - PAD * 2;
    while (size >= 30) {
      ctx.font = size + 'px "Noto Serif SC", "Songti SC", serif';
      lines = wrap(ctx, quoteMeta.text, maxTextW);
      if (lines.length * size * 1.72 < 780) break;
      size -= 4;
    }
    ctx.fillStyle = st.fg;
    ctx.font = size + 'px "Noto Serif SC", "Songti SC", serif';
    const lh = size * 1.72;
    const startY = 360 + 40;
    const shown = lines.slice(0, 14);
    if (lines.length > 14) shown[13] = shown[13].slice(0, -2) + "…";
    shown.forEach((ln, i) => {
      ctx.fillText(ln, PAD, startY + i * lh);
    });

    // 底部
    const footY = H - 180;
    ctx.strokeStyle = st.accent;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(PAD, footY - 62);
    ctx.lineTo(PAD + 90, footY - 62);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = st.muted;
    ctx.font = '30px "Noto Serif SC", "Songti SC", serif';
    if (quoteMeta.chapter) ctx.fillText("《" + quoteMeta.chapter + "》", PAD, footY);

    ctx.textAlign = "right";
    ctx.fillStyle = st.accent;
    ctx.font = '34px "Noto Serif SC", "Songti SC", serif';
    ctx.fillText(quoteMeta.author || "", W - PAD, footY);
    ctx.textAlign = "left";
  }

  function openQuoteModal(text, chapter) {
    quoteMeta = {
      text: text.replace(/\s+/g, " ").trim(),
      chapter: chapter || "",
      book: "",
      author: SITE_AUTHOR,
    };
    quoteModal.classList.add("open");
    document.body.style.overflow = "hidden";
    const t = document.getElementById("readerTitle");
    quoteMeta.book = t ? "《" + t.textContent + "》" : "";
    drawCard(currentStyle);
  }

  let currentStyle = "paper";
  document.querySelectorAll("[data-card-style]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentStyle = btn.dataset.cardStyle;
      document.querySelectorAll("[data-card-style]").forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
      drawCard(currentStyle);
    });
  });

  if (document.getElementById("quoteClose")) {
    document.getElementById("quoteClose").addEventListener("click", () => {
      quoteModal.classList.remove("open");
      document.body.style.overflow = "";
    });
  }

  if (document.getElementById("quoteDownload")) {
    document.getElementById("quoteDownload").addEventListener("click", () => {
      const url = quoteCanvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "quote-" + Date.now() + ".png";
      a.click();
    });
  }
})();
