/**
 * 광고 룰 필터 (P1) — 순수 결정론. LLM 호출 없음.
 *
 * 신호 6종의 가중합으로 점수를 내고, 임계값에 따라 조치를 매핑한다.
 * 이 모듈은 판정만 한다 — DB 기록/조치 실행은 호출부의 몫이고,
 * P1 단계에서는 드라이런(읽기 전용)으로만 쓴다.
 *
 * 임계값·가중치·목록 조정은 전부 ad-filter-config.ts 에서.
 */

import type { TipTapNode } from "@/types/post"
import {
  DOMAIN_BLACKLIST,
  IGNORED_LINK_DOMAINS,
  SHORT_URL_DOMAINS,
  SPAM_WINDOW_MINUTES,
  SPAM_MIN_COUNT,
  SPAM_SIMILARITY,
  NEW_ACCOUNT_DAYS,
  LINK_DENSITY_MIN_LINKS,
  LINK_DENSITY_CHARS_PER_LINK,
  CONTACT_LINK_PATTERNS,
  CONTACT_TEXT_PATTERNS,
  SIGNAL_WEIGHTS,
  THRESHOLDS,
} from "./ad-filter-config"

type AdSignalId = keyof typeof SIGNAL_WEIGHTS

interface AdSignalHit {
  id: AdSignalId
  /** 0..1 — 신호 자체의 확신도 */
  score: number
  /** 무엇이 걸렸는지 (운영자가 읽는 문장. ⚠️ 신고자 정보 금지) */
  detail: string
}

export interface AdFilterInput {
  /** 제목 + 본문 텍스트 (URL 포함) */
  text: string
  /** 작성자 가입 후 경과일. 모르면 null (신규계정 신호 스킵) */
  authorAgeDays: number | null
  /** 이 글의 작성 시각 */
  createdAt: Date
  /** 같은 작성자의 다른 글 (도배 판정용). 없으면 빈 배열 */
  otherPostsBySameAuthor: Array<{ text: string; createdAt: Date }>
}

interface AdFilterResult {
  /** 최종 점수 = min(1, Σ 가중치 × 신호점수) */
  score: number
  signals: AdSignalHit[]
  verdict: "VIOLATION" | "NO_VIOLATION"
  action: "BLIND" | "VISIBILITY_DOWN" | "NO_ACTION"
  enqueue: boolean
}

// ── 텍스트/URL 추출 ─────────────────────────────────────────────

/**
 * TipTap JSON에서 텍스트 전부 추출 — URL 포함.
 * lib/tiptap/extract-text 는 피드 미리보기용이라 URL 을 걸러내는데,
 * 광고 탐지에는 URL 이 가장 중요한 신호라 걸러내지 않는 별도 워커가 필요하다.
 */
export function extractAllText(content: TipTapNode | null | undefined): string {
  if (!content || typeof content !== "object") return ""
  const parts: string[] = []
  if (content.type === "text" && content.text) parts.push(content.text)
  // 임베드/링크 노드가 attrs 에 URL 을 들고 있는 경우도 수거
  const attrs = (content as { attrs?: Record<string, unknown> }).attrs
  if (attrs) {
    for (const key of ["src", "href", "url"]) {
      const v = attrs[key]
      if (typeof v === "string" && v.startsWith("http")) parts.push(v)
    }
  }
  if (Array.isArray(content.content)) {
    for (const child of content.content) parts.push(extractAllText(child))
  }
  return parts.filter(Boolean).join(" ")
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi

export function extractUrls(text: string): string[] {
  return text.match(URL_RE) ?? []
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return null
  }
}

/** host 가 도메인 목록의 항목과 같거나 그 서브도메인이면 true */
function matchesDomain(host: string, domains: string[]): string | null {
  for (const d of domains) {
    if (host === d || host.endsWith(`.${d}`)) return d
  }
  return null
}

// ── 유사도 (도배 판정) ─────────────────────────────────────────

function trigrams(text: string): Set<string> {
  const norm = text.toLowerCase().replace(/\s+/g, "")
  const grams = new Set<string>()
  for (let i = 0; i <= norm.length - 3; i++) grams.add(norm.slice(i, i + 3))
  return grams
}

/** 3-gram Jaccard 유사도. 짧은 글(3자 미만)은 완전 일치만 인정 */
export function textSimilarity(a: string, b: string): number {
  const ga = trigrams(a)
  const gb = trigrams(b)
  if (ga.size === 0 || gb.size === 0) {
    return a.trim() !== "" && a.trim() === b.trim() ? 1 : 0
  }
  let inter = 0
  for (const g of ga) if (gb.has(g)) inter++
  return inter / (ga.size + gb.size - inter)
}

// ── 신호 6종 ───────────────────────────────────────────────────

function checkDomainBlacklist(urls: string[]): AdSignalHit | null {
  for (const url of urls) {
    const host = hostnameOf(url)
    if (!host) continue
    const hit = matchesDomain(host, DOMAIN_BLACKLIST)
    if (hit) return { id: "domainBlacklist", score: 1, detail: `블랙리스트 도메인: ${hit}` }
  }
  return null
}

function checkShortUrl(urls: string[]): AdSignalHit | null {
  for (const url of urls) {
    const host = hostnameOf(url)
    if (!host) continue
    const hit = matchesDomain(host, SHORT_URL_DOMAINS)
    if (hit) return { id: "shortUrl", score: 1, detail: `단축 URL: ${hit}` }
  }
  return null
}

function checkSpamRepeat(input: AdFilterInput): AdSignalHit | null {
  const windowMs = SPAM_WINDOW_MINUTES * 60_000
  const t = input.createdAt.getTime()
  let similar = 1 // 자기 자신 포함
  for (const other of input.otherPostsBySameAuthor) {
    if (Math.abs(other.createdAt.getTime() - t) > windowMs) continue
    if (textSimilarity(input.text, other.text) >= SPAM_SIMILARITY) similar++
  }
  if (similar >= SPAM_MIN_COUNT) {
    return {
      id: "spamRepeat",
      score: 1,
      detail: `${SPAM_WINDOW_MINUTES}분 내 유사 본문 ${similar}회`,
    }
  }
  return null
}

function checkNewAccountLink(input: AdFilterInput, urls: string[]): AdSignalHit | null {
  if (input.authorAgeDays === null || urls.length === 0) return null
  if (input.authorAgeDays <= NEW_ACCOUNT_DAYS) {
    return {
      id: "newAccountLink",
      score: 1,
      detail: `가입 ${Math.floor(input.authorAgeDays)}일차 계정의 외부 링크`,
    }
  }
  return null
}

/** bodyText 는 URL 이 이미 제거된 본문이어야 한다 */
function checkLinkDensity(bodyText: string, urls: string[]): AdSignalHit | null {
  if (urls.length < LINK_DENSITY_MIN_LINKS) return null
  const charsPerLink = bodyText.trim().length / urls.length
  if (charsPerLink < LINK_DENSITY_CHARS_PER_LINK) {
    return {
      id: "linkDensity",
      score: 1,
      detail: `링크 ${urls.length}개, 링크당 본문 ${Math.round(charsPerLink)}자`,
    }
  }
  return null
}

/** textWithoutUrls 는 URL 이 이미 제거된 본문이어야 한다 */
function checkContact(textWithoutUrls: string, urls: string[]): AdSignalHit | null {
  for (const url of urls) {
    for (const re of CONTACT_LINK_PATTERNS) {
      if (re.test(url)) {
        return { id: "contact", score: 1, detail: `연락처 링크: "${url.slice(0, 40)}"` }
      }
    }
  }
  for (const re of CONTACT_TEXT_PATTERNS) {
    const m = textWithoutUrls.match(re)
    if (m) {
      return { id: "contact", score: 1, detail: `연락처 패턴: "${m[0].slice(0, 40)}"` }
    }
  }
  return null
}

// ── 종합 ───────────────────────────────────────────────────────

export function runAdFilter(input: AdFilterInput): AdFilterResult {
  const allUrls = extractUrls(input.text)
  // "외부 링크" 신호에는 임베드/자체 도메인을 제외한다 (드라이런 오탐 실측).
  // 단 블랙리스트 검사는 전체 URL 대상 — 블랙리스트 도메인은 어디 있든 악성이다.
  const externalUrls = allUrls.filter((u) => {
    const host = hostnameOf(u)
    return host !== null && !matchesDomain(host, IGNORED_LINK_DOMAINS)
  })
  // 연락처 패턴은 URL 을 뺀 본문에서만 찾는다 — 트윗 상태 ID 같은
  // URL 내부 숫자열이 전화번호로 오탐되는 것을 막는다.
  const textWithoutUrls = input.text.replace(URL_RE, " ")

  const signals = [
    checkDomainBlacklist(allUrls),
    checkShortUrl(externalUrls),
    checkSpamRepeat(input),
    checkNewAccountLink(input, externalUrls),
    checkLinkDensity(textWithoutUrls, externalUrls),
    checkContact(textWithoutUrls, allUrls),
  ].filter((s): s is AdSignalHit => s !== null)

  const raw = signals.reduce((sum, s) => sum + SIGNAL_WEIGHTS[s.id] * s.score, 0)
  const score = Math.min(1, raw)

  if (score >= THRESHOLDS.blind) {
    return { score, signals, verdict: "VIOLATION", action: "BLIND", enqueue: true }
  }
  if (score >= THRESHOLDS.visibilityDown) {
    return { score, signals, verdict: "VIOLATION", action: "VISIBILITY_DOWN", enqueue: true }
  }
  return { score, signals, verdict: "NO_VIOLATION", action: "NO_ACTION", enqueue: false }
}
