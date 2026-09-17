/**
 * 선수 표기 — **순수 모듈** (2026-08-25 분리).
 *
 * ⚠️ lineups.ts 안에 있던 것을 옮겼다. 거기는 Supabase 를 import 하므로 테스트가 env 없이
 *    못 돌았다 — 그래서 MoTM 투표판에 피드 약어("Palacios C.")가 그대로 나가는데도
 *    **테스트를 붙일 수가 없었다.** injury-terms·day-freshness 와 같은 이유로 뺀다.
 */
import { foldLatin } from "@/lib/text/fold-latin"

export interface SquadName {
  nameEn: string
  /** 공개 표기. name_kr_draft는 이 필드에 넣지 않는다. */
  nameKr: string | null
  playerId?: string
  source?: string
  status?: string
}

export interface PlayerIdentity {
  playerId: string
  provider: "lfa" | "soccerway"
}

/** source는 표기 수확기가 덮어쓰기도 한다. 확인된 수입 경로만 ID 체계로 인정한다. */
function providerOf(row: SquadName): PlayerIdentity["provider"] | null {
  if (row.source === "lfa") return "lfa"
  if (row.source === "namu") return "soccerway"
  return null
}

function tokens(s: string): string[] {
  // ⚠️ foldLatin 을 거치지 않으면 Ø·Ł 같은 **분해되지 않는 글자**가 아래 [^a-z] 에서
  //    통째로 지워진다 — "Ødegaard" 가 "degaard" 가 되어 스쿼드의 "Odegaard" 와
  //    영영 안 맞는다 (2026-09-01 실사고, fold-latin.ts 참조).
  return foldLatin(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3)
}

/**
 * 피드 약어를 사람이 읽는 이름으로 (2026-08-25 외부 감사 P1-5).
 *
 * LFA 는 "Palacios C." 처럼 **성 뒤에 이니셜**을 붙여 준다. 한국 독자에게 이건
 * 이름이 아니라 시스템 찌꺼기로 읽힌다 — 실제로 MoTM 투표판에 그대로 떠 있었다.
 * 한글도 영문 풀네임도 못 찾았을 때의 **최소 예의**로 통상 순서로 뒤집는다.
 */
export function tidyFeedName(lfaName: string): string {
  const m = lfaName.trim().match(/^(.+?)\s+([A-Za-z])\.$/)
  return m ? `${m[2]}. ${m[1]}` : lfaName.trim()
}

/**
 * 스쿼드의 영문명이 **화면에 내놓을 만한가** (2026-08-25 실측).
 *
 * 피드 약어보다 낫다고 무조건 쓰면 안 된다 — 첼시 Quenda 는 스쿼드에
 * "G. Tcherno Tcherno Quenda" 로 들어 있다. 이니셜이 박혀 있고 토큰이 중복돼서,
 * 그대로 쓰면 "G. Quenda" 보다 오히려 나쁘다. 지저분하면 안 쓰는 편이 낫다.
 */
function isCleanFullName(nameEn: string): boolean {
  const n = nameEn.trim()
  if (n.length < 3) return false
  if (/(^|\s)[A-Za-z]\./.test(n)) return false // 이니셜이 섞여 있으면 풀네임이 아니다
  const t = tokens(n)
  return t.length >= 2 && new Set(t).size === t.length // 같은 토큰 반복 = 데이터 오염
}

/** 이 약어가 이 스쿼드 선수를 가리키는가 — 성 일치 + (이니셜이 있으면) 이름 첫 글자 */
function matchesSquad(lfaName: string, nameEn: string): boolean {
  // 이니셜은 앞("J. Agirrezabala")에도 뒤("Palacios C.")에도 온다 — 둘 다 본다
  const initial =
    lfaName.match(/^([A-Za-z])\.\s*/)?.[1]?.toLowerCase() ??
    lfaName.match(/\s([A-Za-z])\.$/)?.[1]?.toLowerCase() ??
    null
  const surname = tokens(lfaName.replace(/^[A-Za-z]\.\s*/, "").replace(/\s[A-Za-z]\.$/, ""))
  if (surname.length === 0) return false

  const candidateInitial =
    nameEn.match(/^([A-Za-z])\.\s*/)?.[1]?.toLowerCase() ??
    nameEn.match(/\s([A-Za-z])\.$/)?.[1]?.toLowerCase()
  if (initial && candidateInitial && initial !== candidateInitial) return false

  const rt = tokens(nameEn)
  if (!surname.every((t) => rt.includes(t))) {
    return false
  }
  if (!initial) return true
  const rest = rt.filter((u) => !surname.includes(u))
  return rest.length === 0 || rest.some((u) => u.startsWith(initial))
}

export interface PlayerNameResolution {
  label: string
  reason:
    | "provider-id"
    | "unique-name"
    /** 후보 여러 행이 전부 같은 한글 — 인물은 못 가르지만 화면 표기는 하나뿐이다. */
    | "unanimous-name"
    /** 후보 여러 행 중 한글이 한 가지뿐(나머지는 빈칸) — 2026-09-17 운영자 승인 규칙. */
    | "single-korean"
    | "full-name"
    | "unmatched"
    | "ambiguous"
    | "translation-conflict"
}

/** 팀으로 좁힌 명단만 받는다. 같은 한글 문자열은 같은 선수라는 증거가 아니다. */
export function resolvePlayerName(
  name: string,
  squad: SquadName[],
  identity?: PlayerIdentity
): PlayerNameResolution {
  const fallback = (reason: PlayerNameResolution["reason"]): PlayerNameResolution => ({
    label: tidyFeedName(name),
    reason,
  })
  const rows = squad.filter((p) => p.status !== "rejected")
  const hits = rows.filter((p) => matchesSquad(name, p.nameEn))
  const direct = identity?.playerId
    ? rows.filter((p) => providerOf(p) === identity.provider && p.playerId === identity.playerId)
    : []
  if (direct.length > 1) return fallback("ambiguous")
  if (direct.length === 1) {
    const row = direct[0]
    // ID는 인물을 식별하지만 번역 충돌을 해결하지 않는다 (M. Tel 운영 사례).
    // 같은 공급자의 서로 다른 ID는 별개 선수이므로 충돌 후보에서 제외한다.
    const crossSource = hits.filter((p) => providerOf(p) !== identity!.provider)
    if (row.nameKr) {
      if (crossSource.some((p) => p.nameKr && p.nameKr !== row.nameKr))
        return fallback("translation-conflict")
      return { label: row.nameKr, reason: "provider-id" }
    }
    // 직접 행에 한글이 없으면, 같은 팀에서 성+이니셜이 맞는 다른 출처 행의 한글이 한 가지뿐일 때
    // 그것을 쓴다 (2026-09-17 운영자 승인: "넣어"). 두 가지 이상이면 고르지 않는다.
    const crossKorean = new Set(crossSource.map((p) => p.nameKr).filter(Boolean))
    if (crossKorean.size === 1) return { label: [...crossKorean][0]!, reason: "single-korean" }
    return isCleanFullName(row.nameEn)
      ? { label: row.nameEn.trim(), reason: "full-name" }
      : fallback("unmatched")
  }
  // ID가 이미 다른 선수라고 말하면 이름 폴백으로 뒤집지 않는다.
  if (identity?.playerId && hits.some((p) => providerOf(p) === identity.provider && p.playerId))
    return fallback("ambiguous")
  const candidates = hits.filter(
    (p) => !identity?.playerId || providerOf(p) !== identity.provider || !p.playerId
  )
  if (candidates.length === 0) return fallback("unmatched")
  if (candidates.length > 1) {
    // 표시 전용 합의 (2026-09-17 운영자: "무조건 한글"). 후보 전원이 같은 한글이면 어느 인물이든
    // 화면에 쓸 문자열은 하나다 — 행을 합치거나 ID 를 잇지는 않는다. 한글이 갈리거나 비면 모호.
    const agreed = new Set(candidates.map((p) => p.nameKr))
    if (agreed.size === 1 && candidates[0].nameKr)
      return { label: candidates[0].nameKr, reason: "unanimous-name" }
    // 한글이 한 가지뿐이고 나머지 후보는 빈칸 — 출처별 중복 행이 대부분이라 운영자가 채택했다
    // (2026-09-17). 같은 팀에 같은 성·이니셜의 다른 선수가 있을 위험은 감수한 결정이다.
    const korean = new Set(candidates.map((p) => p.nameKr).filter(Boolean))
    if (korean.size === 1) return { label: [...korean][0]!, reason: "single-korean" }
    return fallback("ambiguous")
  }
  const row = candidates[0]
  if (row.nameKr) return { label: row.nameKr, reason: "unique-name" }
  return isCleanFullName(row.nameEn)
    ? { label: row.nameEn.trim(), reason: "full-name" }
    : fallback("unmatched")
}

export function localizePlayerName(
  name: string,
  squad: SquadName[],
  identity?: PlayerIdentity
): string {
  return resolvePlayerName(name, squad, identity).label
}
