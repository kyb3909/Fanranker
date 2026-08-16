/**
 * 해외 RSS 어댑터 — 사가 수집의 티커 외 보조 소스 (오너 확정 2026-08-03:
 * 티커 2차 소비 + 해외 RSS만, 국내 매체는 안정화 후. VPS 수정 0).
 *
 * RSS 2.0 / Atom 혼용 파싱 — 외부 라이브러리 없이 정규식 (reddit-seed-posts 관례).
 * 여기서는 수집만 한다: 이적 여부 판정은 extract(LLM), 티어는 tier.ts 몫.
 */

interface RssItem {
  title: string
  link: string
  publishedAt: string // ISO
}

interface RssFeed {
  key: string
  url: string
  outlet: string
}

/** 이적 소식이 실제로 흐르는 해외 피드 — 확장은 이 배열에 추가 */
export const SAGA_FEEDS: RssFeed[] = [
  { key: "bbc-football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", outlet: "BBC" },
  {
    key: "lequipe-football",
    url: "https://dwh.lequipe.fr/api/edito/rss?path=/Football/",
    outlet: "L'Équipe",
  },
  {
    key: "skysports-transfers",
    url: "https://www.skysports.com/rss/12691",
    outlet: "Sky Sports",
  },
]

function extractTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"))
  return m ? m[1].trim() : null
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim()
}

/** RSS 2.0 <item> + Atom <entry> 겸용 */
function parseFeed(xml: string): RssItem[] {
  const items: RssItem[] = []
  const blocks = xml.match(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/g) ?? []
  for (const block of blocks) {
    const title = extractTag(block, "title")
    if (!title) continue
    // Atom 은 <link href="..."/>, RSS 는 <link>...</link>
    const linkHref = block.match(/<link[^>]*href="([^"]+)"/)?.[1]
    const link = linkHref ?? extractTag(block, "link") ?? extractTag(block, "guid")
    if (!link) continue
    const published =
      extractTag(block, "pubDate") ??
      extractTag(block, "published") ??
      extractTag(block, "updated") ??
      ""
    const ts = published ? new Date(published) : new Date()
    items.push({
      title: decodeEntities(title),
      link: decodeEntities(link),
      publishedAt: isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString(),
    })
  }
  return items
}

export async function fetchFeed(feed: RssFeed): Promise<RssItem[]> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "GongnoriSagaBot/1.0 (+https://gongnori.fan)" },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`${feed.key} HTTP ${res.status}`)
  return parseFeed(await res.text())
}
