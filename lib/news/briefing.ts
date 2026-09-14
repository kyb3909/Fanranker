import { canonicalSourceUrl } from "@/lib/news/canonical-url"
import type { BackgroundSource } from "@/lib/news/evidence"

export interface BriefingQuery {
  title: string
  material: string
  source_url: string
  published_at?: string
}

export interface BackgroundRow {
  id: string
  created_at: string
  urls: { source?: string } | null
  raw: { source_text?: string; original_title?: string; published_at?: string } | null
  draft: { title?: string } | null
}

const STOP = new Set(
  "the and for with that this from have says said will after before about their they club football news sport sports official interview press conference match post pre reaction manager coach player team today yesterday ahead against been more there what when first last season league premier".split(
    " "
  )
)

function words(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\p{L}]{3,}/gu) ?? []).filter((word) => !STOP.has(word))
  )
}

/** Retrieval uses captured source text, never our generated article as factual evidence. */
export function selectBackground(
  query: BriefingQuery,
  rows: BackgroundRow[],
  now = Date.now()
): BackgroundSource[] {
  const asOf = Math.min(now, Date.parse(query.published_at ?? "") || now)
  const terms = words(query.title.replace(/^\s*\[[^\]]+\]/, ""))
  const queryWords = words(`${query.title} ${query.material.slice(0, 4000)}`)
  const currentUrl = canonicalSourceUrl(query.source_url)
  const sources = new Set<string>()
  return rows
    .flatMap((row) => {
      const url = row.urls?.source
      const text = row.raw?.source_text?.replace(/^\[[^\]]+\]\s*/, "").trim()
      // Unknown source date cannot prove a background article predates the current story.
      const publishedAt = row.raw?.published_at
      const at = Date.parse(publishedAt ?? "")
      if (
        !url ||
        !/^https?:\/\//i.test(url) ||
        !text ||
        text.length < 300 ||
        !Number.isFinite(at) ||
        !Number.isFinite(Date.parse(row.created_at)) ||
        Date.parse(row.created_at) > asOf ||
        at > asOf ||
        at < asOf - 30 * 86400_000 ||
        canonicalSourceUrl(url) === currentUrl
      )
        return []
      const candidateWords = words(`${row.raw?.original_title ?? ""} ${text}`)
      const headlineOverlap = [...terms].filter((t) => candidateWords.has(t)).length
      const totalOverlap = [...queryWords].filter((t) => candidateWords.has(t)).length
      // A club name alone is not enough to attach a different match's quotes.
      if (headlineOverlap < 2 || totalOverlap < 5) return []
      const paragraphs = text.split(/\n+/).filter((p) => p.trim())
      const ranked = paragraphs
        .map((p, i) => ({
          i,
          score: [...terms].filter((t) => words(p).has(t)).length,
        }))
        .sort((a, b) => b.score - a.score)
      const selected = new Set<number>([0])
      for (const { i, score } of ranked.slice(0, 4)) {
        if (score > 0) {
          if (i > 0) selected.add(i - 1) // retain the question/preceding attribution
          selected.add(i)
        }
      }
      let excerpt = ""
      for (const i of [...selected].sort((a, b) => a - b)) {
        if (excerpt.length + paragraphs[i].length + 1 > 5000) continue
        excerpt += (excerpt ? "\n" : "") + paragraphs[i]
      }
      if (excerpt.length < 80) return []
      return [
        {
          score: headlineOverlap * 5 + Math.min(totalOverlap, 20),
          source: {
            id: row.id,
            url,
            title: row.raw?.original_title ?? row.draft?.title ?? "이전 보도",
            published_at: new Date(at).toISOString(),
            excerpt,
          },
        },
      ]
    })
    .sort((a, b) => b.score - a.score || b.source.published_at.localeCompare(a.source.published_at))
    .filter(({ source }) => {
      const url = canonicalSourceUrl(source.url)
      if (sources.has(url)) return false
      sources.add(url)
      return true
    })
    .slice(0, 3)
    .map(({ source }) => source)
}
