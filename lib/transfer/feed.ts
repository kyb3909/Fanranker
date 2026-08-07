import type { createServiceRoleClient } from "@/lib/supabase/server"
import { WOMENS_FOOTBALL_RE } from "@/lib/news/quality-gate"

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

/**
 * 오피셜 마커 — **공식 발표만** (2026-08-04 운영자 확정: "오피셜은 오직 공식 발표,
 * 가능성 높은 건 전부 유력"). here we go·done deal·has signed 같은 기자발 확정
 * 보도는 아무리 확실해도 유력(tier1) — 발표 주체가 구단/기관일 때만 오피셜.
 * (\bofficial\b 단독 매칭은 "first official bid" 오분류 실사고로 제거)
 */
const OFFICIAL_RE =
  /\[오피셜\]|오피셜\s*[:)\]]|공식\s*발표|공식\s*확정|공식\s*입장|이적\s*확정|입단\s*확정|영입\s*확정|이적\s*완료|계약\s*체결.*공식|officially\s+(?:announced|confirmed|unveiled)|is pleased to (?:announce|confirm)|club\s+(?:has\s+)?announced/i

/** 부정 신호 — 오피셜 마커를 인용·부정하는 제목 ("'오피셜' 공식발표 완전 무의미" 사례).
 *  `간주`는 관측 표현 — "영입 확정으로 간주"(AS발 비니시우스, 2026-08-06 실측)가
 *  `영입 확정` 마커에 걸려 오피셜로 오분류됐다. 기자 관측은 아무리 확신해도 오피셜이
 *  아니다(운영자 확정 2026-08-04: 오피셜=공식 발표만). */
const NEGATION_RE = /무의미|미정|불발|취소|무산|아직|간주/

/**
 * 진행형/루머 신호 — 있으면 오피셜 금지 (강한 완료 마커·부정 검사 이후에 적용).
 * "임박·추진·협상·finalising·working on" 은 아무리 유력해도 완료가 아니다.
 */
const HEDGE_RE =
  /루머|이적설|찌라시|임박|가능성|추진|검토|협상|접촉|경쟁|관심|후보|거론|희망|원해|원한다|난항|보류|\?|rumou?r|reportedly|close to|closing in|poised|edging|verge|in talks|negotiat|approach|interest|linked|race for|working on|finalising|finalizing|targets?\b|could\b|would\b/i

/**
 * 유력(tier1) — 신뢰 기자/매체 보도 + 기자발 확정 표현(here we go·done deal 등).
 * "가능성 높은 건 전부 유력" (2026-08-04) — 오피셜에서 강등된 확정 보도가 여기로.
 */
const TIER1_RE =
  /fabrizio\s*romano|\bromano\b|ornstein|plettenberg|di\s*marzio|\bmoretto\b|nicol[oò]\s*schira|\bschira\b|simon stone|bbc|sky sports|sky germany|the athletic|l'?[ée]quipe|guardian|reuters|here we go|done deal|has signed|메디컬\s*통과|completed\s+(?:a\s+|the\s+)?(?:permanent\s+)?(?:transfer|move|deal)|transfer\s+completed|unveiled|합의\s*완료/i

/** original_title 의 [출처] 브래킷 추출 — 기자명이 최우선 출처 */
export function bracketSource(originalTitle: string | null): string | null {
  const m = originalTitle?.match(/^\[([^\]]{2,40})\]/)
  return m ? m[1] : null
}

/** 유통 채널(애그리게이터/커뮤니티) — 출처로 표시하지 않는다 (원 소스가 아님) */
const AGGREGATOR_HOSTS =
  /(^|\.)(yahoo\.com|yahoo\.co\.jp|msn\.com|news\.google\.com|reddit\.com|redd\.it|imgur\.com|streamable\.com|dubz\.co)$/

/** 알려진 매체 도메인 → 표기명. 미등록 도메인은 도메인 첫 조각을 그대로 표기 */
const OUTLET_NAMES: Record<string, string> = {
  "bbc.com": "BBC",
  "bbc.co.uk": "BBC",
  "skysports.com": "Sky Sports",
  "sport.sky.de": "Sky Germany",
  "sky.de": "Sky Germany",
  "theathletic.com": "The Athletic",
  "theguardian.com": "The Guardian",
  "telegraph.co.uk": "Telegraph",
  "thetimes.com": "The Times",
  "reuters.com": "Reuters",
  "lequipe.fr": "L'Équipe",
  "footmercato.net": "Foot Mercato",
  "marca.com": "Marca",
  "as.com": "AS",
  "mundodeportivo.com": "Mundo Deportivo",
  "sport.es": "Sport",
  "gazzetta.it": "Gazzetta",
  "kicker.de": "Kicker",
  "bild.de": "Bild",
  "goal.com": "Goal",
  "espn.com": "ESPN",
  "fabrizioromano.com": "Fabrizio Romano",
  // 국내 매체 (naver author 도메인)
  "yna.co.kr": "연합뉴스",
  "newsis.com": "뉴시스",
  "mk.co.kr": "매일경제",
  "hankyung.com": "한국경제",
  "khan.co.kr": "경향신문",
  "chosun.com": "조선일보",
  "joongang.co.kr": "중앙일보",
  "donga.com": "동아일보",
  "ytn.co.kr": "YTN",
  "sportschosun.com": "스포츠조선",
  "spotvnews.co.kr": "스포티비뉴스",
  "sportalkorea.com": "스포탈코리아",
  "osen.co.kr": "OSEN",
  "mydaily.co.kr": "마이데일리",
  "starnewskorea.com": "스타뉴스",
  "xportsnews.com": "엑스포츠뉴스",
  "interfootball.co.kr": "인터풋볼",
  "sports.khan.co.kr": "경향신문",
}

/** 구단 공식 도메인 — 출처 "구단 공식" + 등급 오피셜 승격 */
const CLUB_HOSTS =
  /(^|\.)(arsenal\.com|liverpoolfc\.com|mancity\.com|manutd\.com|chelseafc\.com|tottenhamhotspur\.com|whufc\.com|realmadrid\.com|fcbarcelona\.com|atleticodemadrid\.com|fcbayern\.com|bvb\.de|psg\.fr|juventus\.com|inter\.it|acmilan\.com|newcastleunited\.com|avfc\.co\.uk)$/

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/** 링크/도메인에서 원 매체 해석. 애그리게이터는 null (표시 금지) */
export function outletFromUrl(url: string | null): string | null {
  const host = hostOf(url)
  if (!host) return null
  if (AGGREGATOR_HOSTS.test(host)) return null
  if (CLUB_HOSTS.test(host)) return "구단 공식"
  // The Athletic 은 nytimes.com/athletic 경로로 서빙됨
  if (host === "nytimes.com") return url?.includes("/athletic/") ? "The Athletic" : "NY Times"
  // SNS — 계정 핸들이 곧 출처 (기자 계정)
  if (host === "x.com" || host === "twitter.com") {
    const h = url?.match(/(?:x|twitter)\.com\/(\w{2,20})/)
    return h ? `@${h[1]}` : null
  }
  if (host === "bsky.app") {
    const h = url?.match(/profile\/([^./]{2,30})/)
    return h ? `@${h[1]}` : null
  }
  if (OUTLET_NAMES[host]) return OUTLET_NAMES[host]
  // 서브도메인 제거 후 재시도 (sport.sky.de → sky.de)
  const parent = host.split(".").slice(-2).join(".")
  if (OUTLET_NAMES[parent]) return OUTLET_NAMES[parent]
  const name = host.split(".")[0]
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** author 필드 해석 — naver 소스는 author 가 원 언론사 도메인 (예: mk.co.kr) */
export function outletFromAuthor(author: string | null): string | null {
  if (!author || author.startsWith("/u/")) return null
  const host = author.replace(/^www\./, "").toLowerCase()
  if (OUTLET_NAMES[host]) return OUTLET_NAMES[host]
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
    const name = host.split(".")[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  return null
}

export function classifyTier(row: {
  category: string | null
  original_title: string | null
  headline_kr: string | null
  link_url: string | null
  source_id?: string | null
}): TransferTier {
  const text = `${row.original_title ?? ""} ${row.headline_kr ?? ""}`
  // 구단 공식 사이트 발 소식 = 오피셜
  const host = hostOf(row.link_url)
  if (host && CLUB_HOSTS.test(host)) return "official"
  // 오피셜 마커를 인용·부정하는 제목은 마커가 있어도 오피셜 금지
  if (!NEGATION_RE.test(text)) {
    if (OFFICIAL_RE.test(text)) return "official"
    // 진행형 신호가 있으면 아래 폴백 승격도 막는다
    if (!HEDGE_RE.test(text)) {
      // 국내 매체(naver)의 transfer 카테고리는 완료 보도 성격 — 단 reddit 의
      // transfer 플레어는 진행 건에도 붙어 (예: "working on £60m deal") 제외.
      if (row.category === "transfer" && row.source_id?.startsWith("naver")) return "official"
    }
  }
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
  author: string | null
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
      "id, headline_kr, original_title, category, importance, score, link_url, external_url, source_id, author, posted_at"
    )
    .eq("community_slug", "football")
    .in("category", ["transfer", "rumor"])
    .gte("posted_at", cutoff)
    .order("posted_at", { ascending: false })
    .limit(limit)

  const rows = ((data ?? []) as TickerRow[])
    .filter((r) => r.headline_kr)
    // 여자 축구 제외 (운영자 확정 2026-08-04) — 뉴스 파이프라인과 동일 기준.
    // 한국어 제목에선 성별 표기가 지워지는 실사고(몰리 바트립)가 있어 URL 까지 검사.
    .filter(
      (r) =>
        !WOMENS_FOOTBALL_RE.test(`${r.headline_kr} ${r.original_title ?? ""} ${r.link_url ?? ""}`)
    )

  // ── 시계열 클럽 모순 강등 (환각 방지 L3 — 디오망데 실사고 2026-08-07) ──
  // 사가 추출이 "최근 언급들과 클럽이 정면 모순"으로 판정한 오피셜은 검수 전까지
  // 오피셜 섹션에 올리지 않는다 (루머로 강등 — 자동 수정은 하지 않는다).
  const officialUrls = rows
    .filter((r) => classifyTier(r) === "official")
    .map((r) => r.external_url)
    .filter((u): u is string => !!u)
  const conflictedUrls = new Set<string>()
  if (officialUrls.length > 0) {
    const { data: conflicted } = await supabase
      .from("saga_reservoir")
      .select("source_url")
      .in("source_url", officialUrls)
      .not("extracted->club_conflict", "is", null)
    for (const c of conflicted ?? []) {
      if (c.source_url) conflictedUrls.add(c.source_url as string)
    }
  }

  return rows.map((r) => ({
    id: r.id,
    headline: r.headline_kr as string,
    originalTitle: r.original_title,
    tier: r.external_url && conflictedUrls.has(r.external_url) ? "rumor" : classifyTier(r),
    // 원 소스 해석 체인: 기자명 브래킷 → naver author 언론사 → 링크 도메인 매체.
    // 야후·레딧 등 유통 채널은 출처로 표시하지 않는다 (운영자 방침 2026-07-26).
    source:
      bracketSource(r.original_title) ??
      outletFromAuthor(r.author) ??
      outletFromUrl(r.link_url) ??
      "",
    sourceUrl: r.link_url || r.external_url,
    redditUrl: r.external_url,
    postedAt: r.posted_at,
    importance: r.importance ?? 0,
    score: r.score ?? 0,
  }))
}
