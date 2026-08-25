/**
 * 선수 표기 — **순수 모듈** (2026-08-25 분리).
 *
 * ⚠️ lineups.ts 안에 있던 것을 옮겼다. 거기는 Supabase 를 import 하므로 테스트가 env 없이
 *    못 돌았다 — 그래서 MoTM 투표판에 피드 약어("Palacios C.")가 그대로 나가는데도
 *    **테스트를 붙일 수가 없었다.** injury-terms·day-freshness 와 같은 이유로 뺀다.
 */

export interface SquadName {
  nameEn: string
  /** 아직 검수 전이면 null — 그래도 영문 풀네임은 쓸 수 있다 (아래 폴백) */
  nameKr: string | null
}

function tokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
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

  const rt = tokens(nameEn)
  if (!surname.every((t) => rt.some((u) => u === t || u.startsWith(t) || t.startsWith(u)))) {
    return false
  }
  if (!initial) return true
  const rest = rt.filter((u) => !surname.some((t) => u === t || u.startsWith(t) || t.startsWith(u)))
  return rest.length === 0 || rest.some((u) => u.startsWith(initial))
}

/**
 * "J. Agirrezabala" → 한글명. **유일하게 결정될 때만** 바꾼다 (fail-closed).
 *
 * ⚠️ 한글 매칭을 **먼저** 끝낸 뒤에 영문 폴백을 본다. 순서가 중요하다 — 검수 전 선수까지
 *    후보에 넣고 한꺼번에 보면, 같은 성을 가진 미검수 선수 때문에 **지금 잘 나오던 한글이
 *    모호해져 사라진다.** 폴백을 더하려다 있던 걸 잃으면 안 된다.
 */
export function localizePlayerName(lfaName: string, squad: SquadName[]): string {
  if (squad.length === 0) return tidyFeedName(lfaName)

  const withKr = squad.filter((p) => p.nameKr)
  const krHits = withKr.filter((p) => matchesSquad(lfaName, p.nameEn))
  if (krHits.length === 1) return krHits[0].nameKr as string

  // 한글이 없거나 모호하면 **영문 풀네임**이라도 준다 — 피드 약어보다 낫다
  const anyHits = squad.filter((p) => matchesSquad(lfaName, p.nameEn))
  if (anyHits.length === 1 && isCleanFullName(anyHits[0].nameEn)) return anyHits[0].nameEn.trim()

  return tidyFeedName(lfaName)
}
