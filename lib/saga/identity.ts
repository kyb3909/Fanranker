/**
 * 사가 identity — 멱등키와 slug 의 단일 소스 (PRD D2·D3·D4).
 *
 * transfer 의 identity 에 목적지 클럽이 **없는** 것이 설계의 핵심이다: 밀란 관심 기사와
 * 바이에른 관심 기사가 문서를 쪼개면 안 된다. 목적지들은 문서 안의 구혼자 스레드 몫.
 */

import type { SagaType } from "./stages"

/** 선수 키 정규화 — 소문자·공백/특수문자 접기. 사전(news_alias_dictionary) 매칭 후의 영문 키 기준 */
export function normalizePlayerKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // 분음부호 제거 (Sáenz → saenz)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/** KST 날짜 버킷 (YYYY-MM-DD) — cluster_key 등 "같은 KST 날" 판정의 단일 소스 */
export function kstDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * transfer 엔트리 cluster_key — saga_entries UNIQUE(saga_id, cluster_key) 멱등의 재료.
 * 2026-08-08 감사: 이 포맷이 4곳(cluster/publish×2/saga-extract)에 하드코딩돼 있어
 * 포맷 변경 시 드리프트 위험 — 단일 소스로 통합.
 */
export function transferClusterKey(
  player: string,
  stageSignal: string | null | undefined,
  occurredAtIso: string
): string {
  return `${normalizePlayerKey(player)}:${stageSignal ?? "news"}:${kstDay(occurredAtIso)}`
}

interface TransferIdentity {
  playerKey: string
  direction: "in" | "out"
  windowKey: string // '2026-summer'
}

export function transferIdentityKey(t: TransferIdentity): string {
  return `transfer:${normalizePlayerKey(t.playerKey)}:${t.direction}:${t.windowKey}`
}

export function identityKey(type: SagaType, subject: Record<string, unknown>): string {
  switch (type) {
    case "transfer":
      return transferIdentityKey({
        playerKey: String(subject.player_key ?? ""),
        direction: subject.direction === "out" ? "out" : "in",
        windowKey: String(subject.window_key ?? ""),
      })
    case "match":
      // D3: 외부 API fixture_id 가 곧 identity — 매칭 문제 원천 차단
      return `match:${String(subject.fixture_id ?? "")}`
    case "season":
      // D4: 팀 + 시즌
      return `season:${String(subject.team_id ?? "")}:${String(subject.season ?? "")}`
  }
}

/** 성(姓) 비교에서 무시할 접미 토큰 */
const NAME_SUFFIXES = new Set(["jr", "junior", "sr", "ii", "iii"])

function nameTokens(key: string): string[] {
  return key.split("-").filter((t) => t.length > 0 && !NAME_SUFFIXES.has(t))
}

/**
 * 같은 선수인가 — "jordan-henderson" 과 "henderson" 처럼 성이 같고 한쪽 토큰이
 * 다른 쪽의 부분집합이면 동일 인물로 본다 (2026-08-04 운영자: "조던 헨더슨 기사와
 * 헨더슨 기사가 다른 사가가 되면 안 돼"). "james-henderson" vs "jordan-henderson"
 * 은 성만 같고 이름이 달라 부분집합이 아니므로 다른 사람.
 */
export function isSamePlayerKey(a: string, b: string): boolean {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (ta.length === 0 || tb.length === 0) return false
  if (ta[ta.length - 1] !== tb[tb.length - 1]) return false // 성이 다르면 남
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  return short.every((t) => long.includes(t))
}

/**
 * 부분 이름인가 — a 가 b 보다 토큰이 적으면서(성씨만 등) 전부 b 에 포함.
 * "diomande" ⊂ "yan-diomande" → true. "yan-diomande" vs "ousmane-diomande" → false.
 *
 * isSamePlayerKey 의 부분집합 규칙은 헨더슨 뭉침(조던/헨더슨)을 막지만, 성씨만 온
 * 보도는 동성이인 **누구의** 부분집합도 되는 게 뒷면이다 — 얀/우스만 디오망데가
 * 한 사가로 합쳐진 실사고 (2026-08-12). 부분 이름 합류는 클럽 맥락(clubsOverlap)을
 * 추가로 요구한다 (create.ts 게이트).
 */
export function isPartialNameOf(a: string, b: string): boolean {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (ta.length === 0 || ta.length >= tb.length) return false
  if (ta[ta.length - 1] !== tb[tb.length - 1]) return false
  return ta.every((t) => tb.includes(t))
}

/** 클럽 맥락 겹침 — 소문자 접기 후 교집합 존재 (judgeClubConsistency 와 같은 정규화 규약) */
export function clubsOverlap(a: string[], b: string[]): boolean {
  const norm = (c: string) => c.trim().toLowerCase()
  const setA = new Set(a.map(norm).filter(Boolean))
  if (setA.size === 0) return false
  return b.some((c) => setA.has(norm(c)))
}

/** slug — URL 용. 멱등키와 달리 사람이 읽는 값이라 충돌 시 suffix 를 붙인다(create 쪽 몫) */
export function baseSlug(type: SagaType, subject: Record<string, unknown>): string {
  if (type === "transfer") {
    const key = normalizePlayerKey(String(subject.player_key ?? "player"))
    const dir = subject.direction === "out" ? "out" : "in"
    const win = String(subject.window_key ?? "").replace("2026-summer", "2026s")
    return `${key}-${dir}-${win}`
  }
  if (type === "match") return `m-${String(subject.fixture_id ?? "")}`
  return `${normalizePlayerKey(String(subject.team_id ?? "team"))}-${String(subject.season ?? "")}`
}
