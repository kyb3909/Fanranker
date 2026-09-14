import { createHash } from "node:crypto"

// No npm dependencies: deploy this file beside news-scanner.mjs.
export const MATCH_NEWS_SOURCES = [
  {
    key: "chelsea",
    aliases: ["chelsea", "첼시"],
    subreddit: "chelseafc",
    url: "https://www.chelseafc.com/en/news/latest-news",
    path: "/en/news/article/",
  },
  {
    key: "manutd",
    aliases: ["manchester united", "맨체스U", "맨유", "맨체스터 유나이티드"],
    subreddit: "reddevils",
    url: "https://www.manutd.com/en/news",
    path: "/en/news/",
  },
  {
    key: "mancity",
    aliases: ["manchester city", "맨체스C", "맨시티", "맨체스터 시티"],
    subreddit: "MCFC",
    url: "https://www.mancity.com/news/mens",
    path: "/news/mens/",
  },
  {
    key: "arsenal",
    aliases: ["arsenal", "아스널", "아스날"],
    subreddit: "Gunners",
    url: "https://www.arsenal.com/news",
    path: "/news/",
  },
  {
    key: "liverpool",
    aliases: ["liverpool", "리버풀"],
    subreddit: "LiverpoolFC",
    url: "https://www.liverpoolfc.com/news",
    path: "/news/",
  },
  {
    key: "tottenham",
    aliases: ["tottenham", "토트넘"],
    subreddit: "coys",
    url: "https://www.tottenhamhotspur.com/news/",
    path: "/news/",
  },
  {
    key: "barcelona",
    aliases: ["barcelona", "바르셀로나", "바르셀로"],
    subreddit: "Barca",
    url: "https://www.fcbarcelona.com/en/football/first-team/news",
    path: "/en/football/first-team/news/",
  },
  {
    key: "bayern",
    aliases: ["bayern", "바이에른", "바이뮌헨"],
    subreddit: "FCBayern",
    url: "https://fcbayern.com/en/news",
    path: "/en/news/",
  },
  {
    key: "juventus",
    aliases: ["juventus", "유벤투스"],
    url: "https://www.juventus.com/en/news",
    path: "/en/news/articles/",
  },
  { key: "bbc", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", rss: true },
  { key: "sky", url: "https://www.skysports.com/rss/11095", rss: true },
  { key: "guardian", url: "https://www.theguardian.com/football/rss", rss: true },
]

export function decodeText(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff))
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(
      /&(amp|quot|apos|lt|gt|nbsp);/g,
      (_, n) => ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " })[n]
    )
    .trim()
}
const plain = (s) =>
  decodeText(String(s))
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
const tag = (s, name) =>
  s.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? ""
const validTime = (s) => (Number.isFinite(Date.parse(s ?? "")) ? new Date(s).toISOString() : null)

/** Keep full paragraphs/Q&A turns. Never cut inside a quotation to satisfy a character cap. */
export function boundParagraphs(text, max = 22000) {
  const out = []
  let size = 0
  for (const p of String(text)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)) {
    if (size + p.length + 1 > max) break
    out.push(p)
    size += p.length + 1
  }
  return out.join("\n")
}

/** Parse public hydration data as JSON only; never execute embedded page scripts. */
function hydrationParagraphs(html) {
  const documents = []
  const visit = (root) => {
    const stack = [root]
    while (stack.length) {
      const item = stack.pop()
      if (!item || typeof item !== "object") continue
      if (item.nodeType === "document" && Array.isArray(item.content)) {
        const textOf = (n) =>
          n.nodeType === "text"
            ? String(n.value ?? "")
            : Array.isArray(n.content)
              ? n.content.map(textOf).join("")
              : ""
        documents.push(
          item.content
            .filter((n) => /paragraph|heading|list/.test(n.nodeType))
            .map(textOf)
            .join("\n")
        )
        continue
      }
      for (const v of Object.values(item)) if (v && typeof v === "object") stack.push(v)
    }
  }
  const frames = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1])
      } catch {
        return ""
      }
    })
    .join("")
  for (const line of frames.split("\n")) {
    const payload = line.slice(line.indexOf(":") + 1)
    if (!/^[\[{]/.test(payload)) continue
    try {
      visit(JSON.parse(payload))
    } catch {
      /* non-JSON flight chunk */
    }
  }
  return documents.sort((a, b) => b.length - a.length)[0] ?? ""
}

export function readArticle(html) {
  let structured = null
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const stack = [JSON.parse(match[1])]
      while (stack.length) {
        const item = stack.pop()
        if (!item || typeof item !== "object") continue
        const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]]
        if (
          types.some((t) =>
            /^(NewsArticle|Article|ReportageNewsArticle|BlogPosting)$/.test(t ?? "")
          )
        ) {
          if (
            !structured ||
            String(item.articleBody ?? "").length > String(structured.articleBody ?? "").length
          )
            structured = item
        }
        for (const v of Object.values(item)) if (v && typeof v === "object") stack.push(v)
      }
    } catch {
      /* invalid JSON-LD is not evidence */
    }
  }
  const meta = {}
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = Object.fromEntries(
      [...m[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((a) => [
        a[1].toLowerCase(),
        decodeText(a[2]),
      ])
    )
    if (attrs.property || attrs.name) meta[attrs.property || attrs.name] = attrs.content
  }
  const articleBlocks = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map(
    (m) => m[1]
  )
  const bodySize = (s) =>
    [...s.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].reduce((n, m) => n + plain(m[1]).length, 0)
  const largestArticle = articleBlocks.sort((a, b) => bodySize(b) - bodySize(a))[0]
  const scoped =
    largestArticle && bodySize(largestArticle) >= 150
      ? largestArticle
      : (html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html)
  const clean = scoped.replace(/<(script|style|noscript|template|nav|footer)\b[\s\S]*?<\/\1>/gi, "")
  const paragraphs = [...clean.matchAll(/<(p|h[2-4])\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => plain(m[2]))
    .filter(
      (p) =>
        p.length >= 5 &&
        !/^(sign (in|up)|subscribe|all rights reserved|privacy policy|accept cookies|download the app|follow us|read more|related articles|advertisement)/i.test(
          p
        )
    )
  const ldText = structured?.articleBody ? decodeText(structured.articleBody) : ""
  const hydrated = hydrationParagraphs(html)
  const text = boundParagraphs(
    [ldText, paragraphs.join("\n"), hydrated].sort((a, b) => b.length - a.length)[0]
  )
  let componentDate = null
  const articleHeader = html.match(/data-component="ArticleHeader"\s+data-props="([^"]+)"/)?.[1]
  if (articleHeader) {
    try {
      componentDate = JSON.parse(decodeText(articleHeader)).articleHeaderDetails?.date
    } catch {
      /* invalid component */
    }
  }
  return {
    text,
    title: plain(String(structured?.headline ?? meta["og:title"] ?? tag(html, "title"))).slice(
      0,
      2000
    ),
    publishedAt: validTime(
      structured?.datePublished ??
        componentDate ??
        meta["article:published_time"] ??
        meta.datePublished ??
        meta.pubdate
    ),
  }
}

export async function fetchDocument(url, fetcher = fetch) {
  const response = await fetcher(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GongnoriNews/2.0; +https://gongnori.fan)" },
    signal: AbortSignal.timeout(12000),
    redirect: "follow",
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const reader = response.body?.getReader()
  if (!reader) throw new Error("empty response")
  const decoder = new TextDecoder()
  let text = "",
    size = 0
  try {
    while (size < 1500000) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
  }
  return { html: text, url: response.url || url }
}

export function parseNewsIndex(html, source) {
  const seen = new Set()
  const items = []
  const add = (href, title, publishedAt) => {
    try {
      const url = new URL(decodeText(href), source.url)
      if (!/^https?:$/.test(url.protocol)) return
      if (
        !source.rss &&
        (url.host !== new URL(source.url).host || !url.pathname.startsWith(source.path))
      )
        return
      if (!source.rss && url.pathname.slice(source.path.length).length < 16) return
      if (/\/(listing|category|tags?)\//i.test(url.pathname)) return
      url.hash = ""
      if (seen.has(url.href) || plain(title).length < 6) return
      if (
        /\bwomen\b|womens|\bwsl\b|under-?1[0-9]|under-?21|\bu1[0-9]s?\b|\bu21s?\b/i.test(
          `${url.pathname} ${title}`
        )
      )
        return
      seen.add(url.href)
      items.push({
        url: url.href,
        title: plain(title).slice(0, 2000),
        publishedAt: validTime(publishedAt),
      })
    } catch {
      /* malformed link */
    }
  }
  if (source.rss) {
    for (const m of html.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
      add(tag(m[0], "link"), tag(m[0], "title"), tag(m[0], "pubDate"))
    }
  } else {
    for (const m of html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const label =
        plain(m[4]) ||
        (m[1] + m[3]).match(/(?:aria-label|title)=["']([^"']+)["']/i)?.[1] ||
        m[2].split("/").pop().replace(/-/g, " ")
      add(m[2], label)
    }
    // Club sites ship article lists as JSON/HTML-escaped component props.
    const blobs = [
      ...[
        ...html.matchAll(
          /<script\b[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi
        ),
      ].map((m) => m[1]),
      ...[...html.matchAll(/data-props="([^"]+)"/g)].map((m) => decodeText(m[1])),
    ]
    for (const blob of blobs) {
      try {
        const stack = [JSON.parse(blob)]
        while (stack.length) {
          const item = stack.pop()
          if (!item || typeof item !== "object") continue
          const href = item.url ?? item.href ?? item.link?.url
          const title = item.headline ?? item.title ?? item.name
          if (typeof href === "string" && typeof title === "string")
            add(href, title, item.datePublished ?? item.publishedAt ?? item.publishedDate)
          for (const value of Object.values(item))
            if (value && typeof value === "object") stack.push(value)
        }
      } catch {
        /* not a news component */
      }
    }
  }
  return items
}

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[\s._-]+/g, "")
function matchesClub(source, match) {
  return source.aliases?.some((a) => match.aliases.some((n) => norm(n).includes(norm(a))))
}
export const isPressStory = (text) =>
  /interview|press conference|presser|reaction|reacts?|reflect|verdict|referee|\bvar\b|post.match|pre.match|says?|said|speaks?|explains?|admits?|insists?|proud|outlines|["“”]|:\s|\bwe\b|\bour\b|\bI\b/i.test(
    text
  )

/** Bounded additional lane. The existing Reddit request/LLM budgets remain in force. */
export async function collectMatchNews({
  matches,
  cursor = 0,
  seen = new Set(),
  fetcher = fetch,
  now = Date.now(),
}) {
  const official = MATCH_NEWS_SOURCES.filter(
    (s) => !s.rss && matches.some((m) => matchesClub(s, m))
  )
  const rotating = official.length
    ? Array.from(
        { length: Math.min(4, official.length) },
        (_, i) => official[(cursor + i) % official.length]
      )
    : []
  const sources = [...rotating, ...MATCH_NEWS_SOURCES.filter((s) => s.rss)]
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const { html } = await fetchDocument(source.url, fetcher)
      const candidates = parseNewsIndex(html, source).filter((item) => {
        if (
          item.publishedAt &&
          (Date.parse(item.publishedAt) < now - 48 * 3600_000 ||
            Date.parse(item.publishedAt) > now + 5 * 60_000)
        )
          return false
        if (!isPressStory(item.title)) return false
        return (
          !source.rss ||
          matches.some((m) =>
            m.aliases.some(
              (a) => a.length >= 4 && item.title.toLowerCase().includes(a.toLowerCase())
            )
          )
        )
      })
      return { source, candidates }
    })
  )
  const posts = [],
    diagnostics = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i],
      source = sources[i]
    if (result.status === "rejected") {
      diagnostics.push({
        source: source.key,
        error: String(result.reason.message ?? result.reason).slice(0, 100),
      })
      continue
    }
    diagnostics.push({ source: source.key, candidates: result.value.candidates.length })
    let accepted = 0
    for (const item of result.value.candidates) {
      const id = "wire-" + createHash("sha256").update(item.url).digest("hex").slice(0, 24)
      if (seen.has(id)) continue
      if (accepted >= 3 || posts.length >= 10) break
      posts.push({
        id,
        ...item,
        published: item.publishedAt,
        permalink: item.url,
        subreddit: source.subreddit ?? "soccer",
        discovery: "match_news",
        sourceKey: source.key,
        match_ids: matches
          .filter((m) =>
            source.rss
              ? m.aliases.some(
                  (a) => a.length >= 4 && item.title.toLowerCase().includes(a.toLowerCase())
                )
              : matchesClub(source, m)
          )
          .map((m) => m.id)
          .slice(0, 4),
      })
      accepted++
    }
  }
  return { posts, diagnostics, nextCursor: official.length ? (cursor + 4) % official.length : 0 }
}
