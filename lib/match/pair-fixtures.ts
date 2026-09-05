/**
 * betman ↔ LFA 경기 짝짓기 — **순수 모듈** (2026-08-30 분리).
 *
 * ## 왜 따로 나왔나
 * 이 로직이 실패하면 그 경기는 betman `gameId` 를 잃는다. gameId 가 없으면 일정 페이지에
 * 매치 링크가 안 걸리고, 불판도 안 깔리고, lfa-warm 예열 대상에서도 빠진다 — 라인업·
 * 스탯·타임라인·MOM·리포트가 **통째로** 끊긴다.
 *
 * 2026-08-30 실사고: 일요일 EPL 3경기(22:00)와 세리에A 2경기(03:45)가 그렇게 끊겼다.
 * 첼시가 2-0 으로 뛰는 동안 사용자가 그 매치 페이지에 들어갈 방법이 없었다.
 * 판별자는 **같은 (리그, 킥오프) 슬롯에 경기가 2개 이상이면 전멸, 1개면 전부 성공**.
 *
 * 그런데 원인을 좁히려 해도 시험을 붙일 수 없었다 — 이 로직이 `get-fixtures.ts` 안에
 * 있었고 그 파일이 `lib/supabase/server` → `lib/env` 를 최상위에서 끌어와, 단위 시험이
 * 뜨자마자 환경변수 부재로 죽었다. 이 저장소가 이미 아는 함정이다
 * ("순수 모듈에 lib/env·supabase/server 최상위 import 금지").
 * 그래서 판정만 여기로 뗀다 — I/O 는 호출부가 하고, 여기는 문자열만 본다.
 */
import { foldLatin } from "@/lib/text/fold-latin"

/**
 * 팀명 대조용 정규화 (한글은 그대로, 영문은 소문자·기호 제거).
 *
 * ⚠️ **NFD 뒤에 NFC 로 반드시 되돌린다** (2026-08-30 실사고의 근본 원인).
 *    NFD 는 한글 음절을 한글 **자모**(U+1100~)로 분해하는데, 아래 화이트리스트는
 *    **완성형**(가-힣, U+AC00~D7A3)만 남긴다 — 그래서 모든 한글 팀명이 **빈 문자열**이
 *    됐다. 빈 문자열은 `overlaps` 의 `length >= 2` 에서 탈락하므로 한글↔한글 대조가
 *    **한 번도 성공한 적이 없었다.**
 *
 *    증상은 "같은 (리그, 킥오프) 슬롯에 경기가 2개 이상이면 전멸": 후보가 하나면
 *    이름 대조 없이 채택하는 분기가 가려주고 있었다. 2026-08-30 일요일 EPL 3경기와
 *    세리에A 2경기가 매치 링크·불판·예열을 통째로 잃었다.
 *
 *    NFD 자체는 라틴 발음부호를 떼려고 있는 것이다(Atlético → atletico). 결합 문자를
 *    지운 뒤 NFC 로 재조합하면 한글은 살고 발음부호만 떨어진다.
 */
export function normTeam(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "")
}

/**
 * ⚠️ **foldLatin 을 거친다** (2026-09-01). NFD 는 발음 부호만 분해한다 — `Ø`·`Ł`·`Đ` 는
 *    독립 글자라 분해되지 않고 아래 `[^a-z0-9\s]` 가 **통째로 지운다.**
 *      "Ødegaard" → "  degaard" → ["degaard"]   vs  "Odegaard Martin" → ["odegaard","martin"]
 *    토큰이 안 겹쳐 대조가 조용히 실패했다. 이 함수는 `localizeScorer`(lib/lfa/match.ts)가
 *    타임라인 이름을 **저장 시점에** 한글화할 때도 쓰므로, 실패가 저장분에 굳었다 —
 *    끝난 경기 상세는 수명이 Infinity 라 스스로 낫지 않는다. (fold-latin.ts 참조)
 */
/**
 * LFA 가 `lang=en` 인데도 섞어 쓰는 터키식 지명 → 영문 (2026-09-02 실측).
 * "Marsilya"(마르세유)는 사전 "Marseille" 와 토큰이 하나도 안 겹쳐 14일 136경기 중 유일한
 * 헛거절이었다. "Sofya"(소피아)도 같은 계열. 우리 사전의 문제가 아니라 **소스의 표기 버릇**이라
 * 사전이 아닌 여기서 흡수한다 — 관측된 것만 넣는다.
 */
const LFA_EXONYMS: Record<string, string> = {
  marsilya: "marseille",
  sofya: "sofia",
}

export function tokens(s: string): string[] {
  return (
    foldLatin(s)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      // 3글자 미만은 버린다 — "fc"·"sc" 같은 접미가 서로 다른 팀을 이어붙인다
      .filter((t) => t.length >= 3 && !["afc", "the"].includes(t))
      .map((t) => LFA_EXONYMS[t] ?? t)
  )
}

/** LFA 축약명과 우리 영문명이 같은 팀인가 — **느슨한 양방향 접두 겹침** */
export function teamMatches(lfaName: string, ourEn: string): boolean {
  const a = tokens(lfaName)
  const b = tokens(ourEn)
  if (a.length === 0 || b.length === 0) return false
  return a.some((t) => b.some((u) => u.startsWith(t) || t.startsWith(u)))
}

export interface TeamSided {
  homeTeam: string
  awayTeam: string
  /** 누락된 일정도 입력으로 받을 수 있지만, 대회/시각이 없으면 자동 매핑하지 않는다. */
  leagueCode?: string
  matchTime?: string
  /**
   * 후보(LFA 행)의 영문 원명 — 있으면 영문 대조는 이걸로 한다 (2026-09-02).
   * homeTeam 이 사전을 거쳐 한글이 된 뒤에는 `teamMatches(한글, 영문)` 이 토큰 0개로 항상 실패한다.
   * 사전 표기("셀타 비고")와 betman 표기("RC셀타데비고")가 다른 팀은 접두도 안 겹쳐 두 경로가
   * 다 죽었고, 후보가 하나뿐일 때의 팀명 가드가 그걸 드러냈다 (레알 소시에다드–셀타 링크 소실).
   */
  homeTeamEn?: string
  awayTeamEn?: string
}

type TeamEvidence = "match" | "unknown" | "conflict"
export type CounterpartDecision<T> =
  | { status: "matched"; candidate: T; anchor: "home" | "away" | "both" }
  | { status: "missing" | "ambiguous" | "conflict"; candidate: null }

/** 전체 이름/사전 별칭만 확정 근거로 쓴다. 느슨한 teamMatches는 관제용으로만 남긴다. */
function identityKey(name: string): string {
  if (/[가-힣]/.test(name)) return normTeam(name)
  const parts = tokens(name)
  if (parts.length === 0) return ""
  // 공통 단어 하나로 Manchester City와 다른 City 구단을 이어 붙이지 않는다.
  if (parts.every((p) => ["city", "united", "real", "sporting", "athletic"].includes(p))) return ""
  return parts.join(" ")
}

/** 공유 도시명은 같아도 City/United가 서로 다르면 별칭 미등록이 아니라 다른 구단 증거다. */
function conflictingClubQualifier(a: string, b: string): boolean {
  const qualifier = (value: string) => {
    const words = value.split(" ")
    if (words.includes("city")) return "city"
    if (words.includes("united") || words.includes("utd")) return "united"
    return null
  }
  const x = qualifier(a)
  const y = qualifier(b)
  return x != null && y != null && x !== y
}

function sameSlot(a: TeamSided, b: TeamSided): boolean {
  if (!a.leagueCode || a.leagueCode !== b.leagueCode) return false
  const x = Date.parse(a.matchTime ?? "")
  const y = Date.parse(b.matchTime ?? "")
  return (
    Number.isFinite(x) && Number.isFinite(y) && Math.floor(x / 60_000) === Math.floor(y / 60_000)
  )
}

/**
 * 같은 날짜·대회·킥오프 분 안에서 홈 또는 원정 한 팀이 확실하면 연결한다.
 * 나머지 팀의 미등록 표기는 허용하지만, 사전상 다른 팀이거나 홈/원정이 뒤집혔으면 보류.
 * 동일 조건의 후보가 여럿이면 순서/점수로 임의 선택하지 않는다.
 */
export function matchLfaCounterpart<T extends TeamSided>(
  betman: TeamSided,
  candidates: T[],
  teamEn: Map<string, string>
): CounterpartDecision<T> {
  // 별칭을 여러 구단이 공유하면 하나로 덮지 않는다. 모호한 별칭은 확정 근거가 아니다.
  const identities = new Map<string, Set<string>>()
  for (const [name, english] of teamEn) {
    const canonical = identityKey(english)
    if (!canonical) continue
    for (const alias of [identityKey(name), canonical]) {
      if (!alias) continue
      const ids = identities.get(alias) ?? new Set<string>()
      ids.add(canonical)
      identities.set(alias, ids)
    }
  }
  const identity = (name: string): string | null => {
    const key = identityKey(name)
    const ids = identities.get(key)
    return ids?.size === 1 ? [...ids][0] : null
  }
  const compare = (ourName: string, candidateName: string, original?: string): TeamEvidence => {
    const a = identityKey(ourName)
    const b = identityKey(original || candidateName)
    if (!a || !b) return "unknown"
    if ((identities.get(a)?.size ?? 0) > 1 || (identities.get(b)?.size ?? 0) > 1) return "unknown"
    const ourId = identity(ourName)
    const otherId = identity(original || candidateName)
    if (ourId && otherId) return ourId === otherId ? "match" : "conflict"
    if (conflictingClubQualifier(ourId ?? a, otherId ?? b)) return "conflict"
    if (a === b || (ourId && ourId === b)) return "match"
    // 원명이 있는 경우 잘못 한글화된 표시명만 보고 확정하지 않는다.
    return "unknown"
  }
  const hits: Extract<CounterpartDecision<T>, { status: "matched" }>[] = []
  let conflict = false
  for (const candidate of candidates.filter((c) => sameSlot(betman, c))) {
    const home = compare(betman.homeTeam, candidate.homeTeam, candidate.homeTeamEn)
    const away = compare(betman.awayTeam, candidate.awayTeam, candidate.awayTeamEn)
    const reversed =
      compare(betman.homeTeam, candidate.awayTeam, candidate.awayTeamEn) === "match" ||
      compare(betman.awayTeam, candidate.homeTeam, candidate.homeTeamEn) === "match"
    if (home === "conflict" || away === "conflict" || reversed) {
      conflict = true
      continue
    }
    if (home === "match" || away === "match") {
      hits.push({
        status: "matched",
        candidate,
        anchor: home === "match" ? (away === "match" ? "both" : "home") : "away",
      })
    }
  }
  if (hits.length > 1) return { status: "ambiguous", candidate: null }
  return hits[0] ?? { status: conflict ? "conflict" : "missing", candidate: null }
}

export function pickLfaCounterpart<T extends TeamSided>(
  betman: TeamSided,
  candidates: T[],
  teamEn: Map<string, string>
): T | null {
  return matchLfaCounterpart(betman, candidates, teamEn).candidate
}
