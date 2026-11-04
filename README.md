# 电子书房

个人作品站：在线阅读与下载 EPUB / PDF。零后端、零月租，托管在 GitHub Pages。

## 上线

1. 新建一个 **Public** 仓库
2. 把这个目录里的所有内容（不含外层文件夹）上传到仓库根目录
3. Settings → Pages → Source 选 `Deploy from a branch` → `main` / `/ (root)` → Save
4. 等 1–2 分钟，访问 `https://你的用户名.github.io/仓库名/`

## 加一本书

1. 把 epub 放进 `books/`，封面放进 `media/covers/`
2. 在 `data/books.json` 里加一条记录（字段照抄现有条目）
3. 跑 `python3 tools/build-search-index.py` 重建正文索引
4. 提交

不想碰 JSON：用 <https://app.pagescms.org> 登录，表单填完保存即可（正文索引仍需本地跑脚本）。

## 目录

| 路径 | 作用 |
|---|---|
| `index.html` | 首页：书目、筛选、书目搜索、正文检索 |
| `book.html?id=xxx` | 详情页 + 阅读器 |
| `about.html` | 关于 |
| `data/books.json` | 书目数据 |
| `data/site.json` | 作者名、导语、版权 |
| `data/search-index.json` | 正文索引（脚本生成） |
| `books/` | epub / pdf 文件 |
| `assets/vendor/epub.min.js` | 阅读器内核（本地存放，不依赖 CDN） |
| `.pages.yml` | Pages CMS 后台配置 |
| `sw.js` / `manifest.json` | 离线缓存与主屏幕安装 |

## 本地预览

```bash
python3 -m http.server 8000
```

打开 <http://localhost:8000>。不要直接双击 HTML —— `fetch` 读 JSON 在 `file://` 下会被拦。

## 注意

- 公开仓库意味着源文件公开，别放未公开的稿子。
- 单文件超过 25 MB（网页上传）或 100 MB（命令行）时，改用 GitHub Releases 存放，把下载链接填进 `pdf` 字段。
- 改了 `index.html` / CSS / JS 之后，把 `sw.js` 顶部的 `CACHE` 版本号改一下（`wb-study-v1` → `v2`），否则老访客可能看到缓存旧版。
