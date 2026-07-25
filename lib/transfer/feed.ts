import type { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * 이적시장 상황판 데이터 (비로그인 공개 페이지 /transfer).
 * 뉴스 티커 크롤러(news_ticker_items, 10분 주기)가 이미 적재 중인
 * transfer/rumor 항목을 신뢰 등급으로 분류해 제목만 나열한다 — 별도 수집 없음.
 */

export type TransferTier = "official" | "tier1" | "rumor"

export interface TransferItem {
  id: number
  headline: string
  originalTitle: string | null
  tier: TransferTier
  source: string
  sourceUrl: string | null
  redditUrl: string | null
  postedAt: string
  importance: number
  score: number
}

/** 오피셜 마커 — 제목에 있으면 등급 최상위 */
const OFFICIAL_RE =
  /here we go|official|오피셜|공식 발표|공식 확정|완전 이적|입단|이적 완료|계약 체결|메디컬 통과|has signed|done deal|completed|unveil/i

/** Tier1 기자/매체 — [브래킷] 출처 또는 본문 매칭. 루머라도 사실상 유력 보도로 취급 */
const TIER1_RE =
  /fabrizio\s*romano|\bromano\b|ornstein|plettenberg|di\s*marzio|\bmoretto\b|nicol[oò]\s*schira|\bschira\b|simon stone|bbc|sky sports|sky germany|the athletic|l'?[ée]quipe|guardian|reuters/i

/** original_title 의 [출처] 브래킷 추출 */
function bracketSource(originalTitle: string | null): string | null {
  const m = originalTitle?.match(/^\[([^\]]{2,40})\]/)
  return m ? m[1] : null
}

function domainSource(url: string | null): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname.replace(/^www\./, "")
    if (host.endsWith("redd.it") || host.endsWith("imgur.com")) return null
    const name = host.split(".")[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  } catch {
    return null
  }
}

export function classifyTier(row: {
  category: string | null
  original_title: string | null
  headline_kr: string | null
  link_url: string | null
}): TransferTier {
  const text = `${row.original_title ?? ""} ${row.headline_kr ?? ""}`
  if (OFFICIAL_RE.test(text)) return "official"
  // 네이버 등 국내 매체의 transfer 카테고리 = 완료/확정 보도 성격
  if (row.category === "transfer") return "official"
  if (TIER1_RE.test(text)) return "tier1"
  return "rumor"
}

interface TickerRow {
  id: number
  headline_kr: string | null
  original_title: string | null
  category: string | null
  importance: number | null
  score: number | null
  link_url: string | null
  external_url: string | null
  source_id: string | null
  posted_at: string
}

export async function fetchTransferFeed(
  supabase: ReturnType<typeof createServiceRoleClient>,
  { days = 14, limit = 300 }: { days?: number; limit?: number } = {}
): Promise<TransferItem[]> {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
  const { data } = await supabase
    .from("news_ticker_items")
    .select(
      "id, headline_kr, original_title, category, importance, score, link_url, external_url, source_id, posted_at"
    )
    .eq("community_slug", "football")
    .in("category", ["transfer", "rumor"])
    .gte("posted_at", cutoff)
    .order("posted_at", { ascending: false })
    .limit(limit)

  return ((data ?? []) as TickerRow[])
    .filter((r) => r.headline_kr)
    .map((r) => ({
      id: r.id,
      headline: r.headline_kr as string,
      originalTitle: r.original_title,
      tier: classifyTier(r),
      source:
        bracketSource(r.original_title) ??
        domainSource(r.link_url) ??
        (r.source_id === "reddit-soccer" ? "r/soccer" : (r.source_id ?? "")),
      sourceUrl: r.link_url || r.external_url,
      redditUrl: r.external_url,
      postedAt: r.posted_at,
      importance: r.importance ?? 0,
      score: r.score ?? 0,
    }))
}
