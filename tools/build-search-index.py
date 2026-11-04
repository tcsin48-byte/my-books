#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 site/books/ 里的 EPUB 提取正文，生成 data/search-index.json。
用法：python3 tools/build-search-index.py
加书或改书后跑一次，然后提交生成的 JSON。
"""
import json
import os
import re
import sys
import zipfile
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKS_JSON = os.path.join(ROOT, "data", "books.json")
OUT = os.path.join(ROOT, "data", "search-index.json")
MAX_SECTION_CHARS = 8000


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self.skip += 1
        elif tag in ("p", "div", "br", "h1", "h2", "h3", "h4", "li", "tr", "blockquote"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head"):
            self.skip = max(0, self.skip - 1)
        elif tag in ("p", "div", "h1", "h2", "h3", "h4", "li", "blockquote"):
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)

    def text(self):
        raw = "".join(self.parts)
        raw = raw.replace("\u3000", " ")
        raw = re.sub(r"[ \t\r\f\v]+", " ", raw)
        raw = re.sub(r"\n\s*\n+", "\n", raw)
        return raw.strip()


def opf_path(z):
    try:
        container = z.read("META-INF/container.xml").decode("utf-8", "ignore")
    except KeyError:
        return None
    m = re.search(r'full-path="([^"]+)"', container)
    return m.group(1) if m else None


def parse_epub(path):
    """返回 [(href, 正文)]，按 spine 顺序。"""
    sections = []
    with zipfile.ZipFile(path) as z:
        opf = opf_path(z)
        if not opf:
            return sections
        base = os.path.dirname(opf)
        opf_xml = z.read(opf).decode("utf-8", "ignore")

        manifest = {}
        for m in re.finditer(r"<item\b[^>]*>", opf_xml):
            tag = m.group(0)
            iid = re.search(r'id="([^"]+)"', tag)
            href = re.search(r'href="([^"]+)"', tag)
            mtype = re.search(r'media-type="([^"]+)"', tag)
            if iid and href and mtype and "xhtml" in mtype.group(1):
                manifest[iid.group(1)] = href.group(1)

        order = re.findall(r'<itemref\b[^>]*idref="([^"]+)"', opf_xml)

        for iid in order:
            href = manifest.get(iid)
            if not href:
                continue
            full = href if not base else base.rstrip("/") + "/" + href
            try:
                doc = z.read(full).decode("utf-8", "ignore")
            except KeyError:
                continue
            p = TextExtractor()
            p.feed(doc)
            text = p.text()
            if text:
                sections.append((href, text[:MAX_SECTION_CHARS]))
    return sections


def guess_label(text):
    first = text.split("\n", 1)[0].strip()
    return first[:40] if first else "正文"


def main():
    with open(BOOKS_JSON, encoding="utf-8") as f:
        books = json.load(f)
    if isinstance(books, dict):
        books = books.get("books", [])

    index = []
    for b in books:
        rel = (b.get("epub") or "").strip()
        if not rel:
            continue
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            print("跳过（文件不存在）:", rel, file=sys.stderr)
            continue
        sections = parse_epub(path)
        if not sections:
            print("跳过（无正文）:", rel, file=sys.stderr)
            continue
        index.append(
            {
                "id": b.get("id", ""),
                "title": b.get("title", ""),
                "sections": [
                    {"href": href, "label": guess_label(text), "text": text}
                    for href, text in sections
                ],
            }
        )
        print("已索引", b.get("title"), len(sections), "节")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(OUT)
    print("写出", OUT, size, "bytes")


if __name__ == "__main__":
    main()
