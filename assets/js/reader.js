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
      return obj && (obj.anchor || obj.cfi) ? obj : null;
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

    /* ── EPUB：自建分栏分页器 ──
       不用 epub.js 的分页器。它的 default manager 靠「scrollLeft 取整吸附」定页
       （needsSnap: scrollLeft % pageWidth !== 0），列宽和容器差一点点，
       每次翻页都会被吸回上一页 —— 表现就是页码在 1、2、3 之间来回跳。
       这里自己切栏：一栏即一页，翻页只平移一栏，总页数由 scrollWidth 算出，不吸附。 */

    const EPUB_MIME = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
      webp: "image/webp", svg: "image/svg+xml", css: "text/css",
      ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2",
    };
    const mimeOfPath = (p) =>
      EPUB_MIME[(String(p).split(".").pop() || "").toLowerCase()] || "application/octet-stream";

    function joinPath(base, rel) {
      const parts = (base ? String(base).split("/") : []).concat(String(rel).split("/"));
      const out = [];
      parts.forEach((p) => {
        if (!p || p === ".") return;
        if (p === "..") out.pop();
        else out.push(p);
      });
      return out.join("/");
    }

    const dirOfPath = (p) => {
      const s = String(p);
      const i = s.lastIndexOf("/");
      return i < 0 ? "" : s.slice(0, i);
    };

    function startEpub(url) {
      viewerEl.innerHTML = "";
      progressBar.style.width = "0%";

      const pageInfoEl = document.getElementById("pageInfo");
      const setPageInfo = (t) => { if (pageInfoEl) pageInfoEl.textContent = t || ""; };
      setPageInfo("");

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

      if (typeof JSZip === "undefined") {
        fail("阅读组件未加载：assets/vendor/jszip.min.js 缺失。");
        return;
      }

      const st = {
        pager: null, flow: null, W: 0, H: 0,
        pages: 1, page: 0, fontPct: 100,
        chapters: [], cssText: "",
      };

      let zip = null;
      let themeName = "paper";
      let lastTurn = 0;
      let suppressClickUntil = 0;
      let saveTimer = null;
      let lastQuote = "";
      let currentTitle = "";

      /* ── 解压 + 解析 ── */
      async function parseBook() {
        const res = await fetch(url);
        if (!res.ok) throw new Error("下载失败 HTTP " + res.status);
        zip = await JSZip.loadAsync(await res.arrayBuffer());

        const contFile = zip.file("META-INF/container.xml");
        if (!contFile) throw new Error("不是有效的 EPUB：缺少 META-INF/container.xml");
        const cont = new DOMParser().parseFromString(await contFile.async("string"), "application/xml");
        const rootfile = cont.getElementsByTagName("rootfile")[0];
        if (!rootfile) throw new Error("EPUB 缺少 OPF 索引");
        const opfPath = rootfile.getAttribute("full-path");
        const opfDir = dirOfPath(opfPath);
        const opfFile = zip.file(opfPath);
        if (!opfFile) throw new Error("找不到 OPF 文件：" + opfPath);
        const opf = new DOMParser().parseFromString(await opfFile.async("string"), "application/xml");

        const items = {};
        Array.prototype.forEach.call(opf.getElementsByTagName("item"), (el) => {
          const id = el.getAttribute("id");
          if (!id) return;
          items[id] = {
            href: joinPath(opfDir, el.getAttribute("href") || ""),
            props: el.getAttribute("properties") || "",
            type: el.getAttribute("media-type") || "",
          };
        });

        const spine = Array.prototype.map
          .call(opf.getElementsByTagName("itemref"), (el) => items[el.getAttribute("idref")])
          .filter((it) => it && it.href && (it.type === "application/xhtml+xml" || /\.x?html$/.test(it.href)));
        if (!spine.length) throw new Error("EPUB 里没有可显示的正文");

        const idxOf = {};
        spine.forEach((it, i) => { idxOf[it.href] = i; });

        /* 素材 → blob 地址，避免相对路径失效 */
        const blobs = {};
        async function asset(p) {
          if (p in blobs) return blobs[p];
          const f = zip.file(p);
          if (!f) { blobs[p] = ""; return ""; }
          const raw = await f.async("blob");
          const u = URL.createObjectURL(new Blob([raw], { type: mimeOfPath(p) }));
          blobs[p] = u;
          return u;
        }

        const cssSeen = {};
        let cssText = "";
        const chapters = [];

        for (let i = 0; i < spine.length; i++) {
          const it = spine[i];
          const file = zip.file(it.href);
          if (!file) continue;
          const text = await file.async("string");
          let doc = new DOMParser().parseFromString(text, "application/xhtml+xml");
          if (!doc.getElementsByTagName("body").length) {
            doc = new DOMParser().parseFromString(text, "text/html");
          }
          const body = doc.getElementsByTagName("body")[0];
          if (!body) continue;
          const chDir = dirOfPath(it.href);

          /* 样式表：读出来内联，url() 换成 blob */
          const links = Array.prototype.slice.call(doc.getElementsByTagName("link"));
          for (const l of links) {
            if (!/stylesheet/i.test(l.getAttribute("rel") || "")) continue;
            const p = joinPath(chDir, l.getAttribute("href") || "");
            if (!p || cssSeen[p]) continue;
            cssSeen[p] = true;
            const cf = zip.file(p);
            if (!cf) continue;
            let css = await cf.async("string");
            const urls = css.match(/url\(([^)]+)\)/g) || [];
            for (const raw of urls) {
              const m = raw.match(/url\(['"]?([^'")]+)['"]?\)/);
              if (!m) continue;
              const ref = m[1];
              if (/^(data:|https?:|blob:|#)/i.test(ref)) continue;
              const u = await asset(joinPath(dirOfPath(p), ref.split(/[?#]/)[0]));
              if (u) css = css.split(raw).join("url('" + u + "')");
            }
            cssText += "\n" + css;
          }

          Array.prototype.forEach.call(body.getElementsByTagName("script"), (s) => {
            if (s.parentNode) s.parentNode.removeChild(s);
          });

          const imgs = Array.prototype.slice.call(body.getElementsByTagName("img"));
          for (const img of imgs) {
            const src = img.getAttribute("src") || "";
            if (!src || /^(data:|https?:|blob:)/i.test(src)) continue;
            const u = await asset(joinPath(chDir, src.split(/[?#]/)[0]));
            if (u) img.setAttribute("src", u);
            else img.removeAttribute("src");
          }

          const svgImgs = Array.prototype.slice.call(body.getElementsByTagName("image"));
          for (const img of svgImgs) {
            const src =
              img.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
              img.getAttribute("xlink:href") || img.getAttribute("href") || "";
            if (!src || /^(data:|https?:|blob:)/i.test(src)) continue;
            const u = await asset(joinPath(chDir, src.split(/[?#]/)[0]));
            if (u) {
              try { img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", u); } catch (e) {}
              img.setAttribute("href", u);
            }
          }

          Array.prototype.forEach.call(body.getElementsByTagName("a"), (a) => {
            const href = a.getAttribute("href") || "";
            if (!href) return;
            if (/^(mailto:|tel:|https?:)/i.test(href)) {
              a.setAttribute("target", "_blank");
              a.setAttribute("rel", "noopener");
              return;
            }
            const hash = href.indexOf("#");
            const pathPart = hash < 0 ? href : href.slice(0, hash);
            const frag = hash < 0 ? "" : href.slice(hash + 1);
            let target = i;
            if (pathPart) {
              const p = joinPath(chDir, pathPart);
              if (idxOf[p] != null) target = idxOf[p];
            }
            const id = "c" + target + "_" + frag;
            a.setAttribute("href", "#" + id);
            a.setAttribute("data-jump", id);
          });

          /* id 加章节前缀，避免不同章节重名；没有 id 的段落补一个，用于记住阅读位置 */
          Array.prototype.forEach.call(body.querySelectorAll("[id]"), (el) => {
            el.setAttribute("id", "c" + i + "_" + el.getAttribute("id"));
          });
          let bi = 0;
          Array.prototype.forEach.call(
            body.querySelectorAll("p, h1, h2, h3, h4, li, blockquote, div"),
            (el) => {
              if (el.getAttribute("id")) return;
              el.setAttribute("id", "c" + i + "_b" + bi++);
            }
          );

          let title = "";
          const h = body.querySelector("h1, h2, h3");
          if (h && h.textContent) title = h.textContent.replace(/\s+/g, " ").trim();
          if (!title) title = "第 " + (i + 1) + " 节";

          chapters.push({ html: body.innerHTML, title: title, href: it.href });
        }

        if (!chapters.length) throw new Error("EPUB 正文为空");
        st.chapters = chapters;
        st.cssText = cssText;

        /* 目录 */
        const toc = [];
        const navIt = Object.keys(items).map((k) => items[k]).find((it) => it && /nav/.test(it.props));
        if (navIt) {
          const f = zip.file(navIt.href);
          if (f) {
            const navDoc = new DOMParser().parseFromString(await f.async("string"), "application/xhtml+xml");
            const navDir = dirOfPath(navIt.href);
            Array.prototype.forEach.call(navDoc.getElementsByTagName("a"), (a) => {
              const href = a.getAttribute("href") || "";
              const label = (a.textContent || "").replace(/\s+/g, " ").trim();
              if (!href || !label) return;
              const hash = href.indexOf("#");
              const pathPart = hash < 0 ? href : href.slice(0, hash);
              const frag = hash < 0 ? "" : href.slice(hash + 1);
              const p = pathPart ? joinPath(navDir, pathPart) : navIt.href;
              const idx = idxOf[p];
              if (idx == null) return;
              toc.push({ label: label, id: "c" + idx + "_" + frag });
            });
          }
        }
        if (!toc.length) {
          chapters.forEach((c, i) => toc.push({ label: c.title, id: "c" + i + "_" }));
        }
        st.toc = toc;
      }

      /* ── 版面 ── */
      function measure(keepAnchor) {
        const anchorId = keepAnchor ? currentAnchor() : "";
        const W = Math.max(240, Math.floor(viewerEl.clientWidth));
        const H = Math.max(240, Math.floor(viewerEl.clientHeight));
        st.W = W;
        st.H = H;
        st.flow.style.width = W + "px";
        st.flow.style.height = H + "px";
        st.flow.style.columnWidth = W + "px";
        st.flow.style.columnGap = "0px";
        st.flow.style.columnFill = "auto";
        st.flow.style.fontSize = st.fontPct + "%";

        /* 总宽 = 所有栏的宽度之和。scrollWidth 是首选，
           再用最后一章的右边界兜底（不同浏览器对多栏 scrollWidth 的实现有差异） */
        let total = st.flow.scrollWidth || 0;
        const fr = st.flow.getBoundingClientRect();
        const secs = st.flow.querySelectorAll(".chapter");
        const lastSec = secs[secs.length - 1];
        if (lastSec) {
          const lr = lastSec.getBoundingClientRect();
          total = Math.max(total, lr.right - fr.left);
        }
        st.pages = Math.max(1, Math.round(total / W));
        goto(anchorId ? columnOf(anchorId) : Math.min(st.page, st.pages - 1));
      }

      function columnOf(id) {
        const el = document.getElementById(id);
        if (!el) return 0;
        const left = el.getBoundingClientRect().left - st.flow.getBoundingClientRect().left;
        return Math.max(0, Math.floor(left / st.W + 0.02));
      }

      function goto(p) {
        st.page = Math.max(0, Math.min(st.pages - 1, Math.round(p || 0)));
        st.flow.style.transform = "translate3d(" + (-st.page * st.W) + "px,0,0)";
        render();
      }

      function currentAnchor() {
        if (!st.pager || !st.pages) return "";
        const r = st.pager.getBoundingClientRect();
        let el = document.elementFromPoint(r.left + 10, r.top + 10);
        /* 只往上找到 flow 为止，别走到 #viewer，否则会误当第一章 */
        while (el && el !== st.flow) {
          if (el.id) return el.id;
          el = el.parentElement;
        }
        return "";
      }

      function chapterIndexAt(el) {
        const sec = el && el.closest ? el.closest("section[data-ch]") : null;
        return sec ? Number(sec.getAttribute("data-ch")) : -1;
      }

      function render() {
        const pct = st.pages > 1 ? st.page / (st.pages - 1) : 1;
        progressBar.style.width = (pct * 100).toFixed(2) + "%";
        setPageInfo("第 " + (st.page + 1) + " / " + st.pages + " 页");

        const aid = currentAnchor();
        const ci = aid ? chapterIndexAt(document.getElementById(aid)) : -1;
        if (ci >= 0 && st.chapters[ci] && st.chapters[ci].title) currentTitle = st.chapters[ci].title;

        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveProgress(b.id, {
            anchor: aid || "",
            pct: st.pages > 1 ? st.page / (st.pages - 1) : 0,
            at: new Date().toISOString().slice(0, 10),
          });
        }, 900);
      }

      function jumpTo(id) {
        if (!id) return;
        let el = document.getElementById(id);
        if (!el) el = document.getElementById(id.replace(/_+$/, ""));
        if (!el) return;
        const left = el.getBoundingClientRect().left - st.flow.getBoundingClientRect().left;
        goto(Math.floor(left / st.W + 0.02));
      }

      function turn(dir) {
        const now = Date.now();
        if (now - lastTurn < 120) return;
        lastTurn = now;
        goto(st.page + dir);
      }

      /* ── 主题 ── */
      const THEMES = {
        paper: { bg: "#fdfbf4", fg: "#1f2320" },
        plain: { bg: "#ffffff", fg: "#111111" },
        night: { bg: "#16181a", fg: "#c3c8c3" },
      };
      function applyTheme(name) {
        const t = THEMES[name] || THEMES.paper;
        if (!st.pager) return;
        st.pager.style.background = t.bg;
        st.pager.style.color = t.fg;
      }

      /* ── 挂载 ── */
      function mount() {
        viewerEl.innerHTML = "";
        const pager = document.createElement("div");
        pager.className = "pager";
        const flow = document.createElement("div");
        flow.className = "pager-flow";
        st.chapters.forEach((c, i) => {
          const sec = document.createElement("section");
          sec.className = "chapter";
          sec.setAttribute("data-ch", String(i));
          sec.innerHTML = c.html;
          flow.appendChild(sec);
        });
        pager.appendChild(flow);
        viewerEl.appendChild(pager);
        st.pager = pager;
        st.flow = flow;

        if (st.cssText) {
          const s = document.createElement("style");
          s.textContent = st.cssText;
          flow.insertBefore(s, flow.firstChild);
        }
        applyTheme(themeName);
        measure(false);
      }

      /* ── 交互 ── */
      function bindPager() {
        const pager = st.pager;

        pager.addEventListener("click", (e) => {
          if (Date.now() < suppressClickUntil) return;
          const t = e.target;
          const link = t && t.closest ? t.closest("a[data-jump]") : null;
          if (link) {
            e.preventDefault();
            hideQuoteBtn();
            jumpTo(link.getAttribute("data-jump"));
            return;
          }
          if (t && t.closest && t.closest("a[href^='http']")) return;
          const sel = window.getSelection ? window.getSelection() : null;
          if (sel && String(sel).trim()) return;
          hideQuoteBtn();
          turn(1);
        });

        pager.addEventListener("mouseup", () => {
          const sel = window.getSelection ? String(window.getSelection()).trim() : "";
          if (sel.length > 4) {
            lastQuote = sel;
            setTimeout(showQuoteBtn, 40);
          }
        });

        /* 手机上长按选字没有 mouseup，用 selectionchange 兜一下 */
        let selTimer = null;
        document.addEventListener("selectionchange", () => {
          clearTimeout(selTimer);
          selTimer = setTimeout(() => {
            const sel = window.getSelection ? String(window.getSelection()).trim() : "";
            if (sel.length > 4) {
              lastQuote = sel;
              showQuoteBtn();
            }
          }, 600);
        });

        let sx = 0, sy = 0, stt = 0;
        pager.addEventListener("touchstart", (e) => {
          if (e.touches.length !== 1) return;
          sx = e.touches[0].clientX;
          sy = e.touches[0].clientY;
          stt = Date.now();
        }, { passive: true });

        pager.addEventListener("touchend", (e) => {
          if (!e.changedTouches || !e.changedTouches.length) return;
          const dx = e.changedTouches[0].clientX - sx;
          const dy = e.changedTouches[0].clientY - sy;
          if (Date.now() - stt > 800) return;
          if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          suppressClickUntil = Date.now() + 500;
          turn(dx < 0 ? 1 : -1);
        }, { passive: true });
      }

      function renderToc() {
        if (!st.toc.length) {
          tocEl.innerHTML = '<p style="padding:12px;color:#6b7169;font-size:13px">本书没有目录信息。</p>';
          return;
        }
        tocEl.innerHTML = "<h3>目录</h3>" +
          st.toc.map((it) => '<a href="#" data-target="' + esc(it.id) + '">' + esc(it.label) + "</a>").join("");
        tocEl.querySelectorAll("a[data-target]").forEach((a) => {
          a.addEventListener("click", (e) => {
            e.preventDefault();
            jumpTo(a.getAttribute("data-target"));
            closeDrawer();
          });
        });
      }

      /* ── 进度恢复 ── */
      const saved = loadProgress(b.id);

      parseBook()
        .then(() => {
          mount();
          bindPager();
          renderToc();

          if (saved && saved.anchor) jumpTo(saved.anchor);
          else if (saved && typeof saved.pct === "number" && st.pages > 1) {
            goto(Math.round(saved.pct * (st.pages - 1)));
          }
          render();
          lastW = viewerEl.clientWidth;
          lastH = viewerEl.clientHeight;
        })
        .catch((e) => fail(e && e.message ? e.message : String(e)));

      /* 尺寸变化：转到别的位置先记住，重排后再回去 */
      let rzTimer = null;
      let lastW = 0, lastH = 0;
      function onResize() {
        if (!st.pager || !readerEl.classList.contains("open")) return;
        const w = viewerEl.clientWidth;
        const h = viewerEl.clientHeight;
        if (!w || !h) return;
        if (Math.abs(w - lastW) < 8 && Math.abs(h - lastH) < 8) return;
        lastW = w;
        lastH = h;
        measure(true);
      }
      window.addEventListener("resize", () => {
        clearTimeout(rzTimer);
        rzTimer = setTimeout(onResize, 300);
      });
      window.addEventListener("orientationchange", () => {
        clearTimeout(rzTimer);
        rzTimer = setTimeout(onResize, 600);
      });

      /* 键盘 */
      function onKey(e) {
        if (!readerEl.classList.contains("open")) return;
        if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
          e.preventDefault();
          turn(1);
        }
        if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); turn(-1); }
        if (e.key === "Escape") closeReader();
      }
      document.addEventListener("keydown", onKey);

      /* 翻页按钮 */
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

      document.querySelectorAll("[data-font]").forEach((btn) => {
        btn.addEventListener("click", () => {
          st.fontPct = btn.dataset.font === "up" ? Math.min(180, st.fontPct + 10) : Math.max(70, st.fontPct - 10);
          if (st.flow) measure(true);
        });
      });

      document.querySelectorAll("[data-theme]").forEach((btn) => {
        btn.addEventListener("click", () => {
          themeName = btn.dataset.theme;
          applyTheme(themeName);
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
