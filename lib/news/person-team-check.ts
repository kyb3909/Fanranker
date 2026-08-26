/**
 * 기사에 나온 인물이 **그 기사가 다루는 팀 사람인가** 검사 (순수 모듈).
 *
 * ## 왜 필요한가
 * 지금 발행 게이트는 *"이 이름이 사전에 있는가"* 만 본다. 그래서 **사전이 틀리면
 * 조용히 통과한다** — 2026-08-26 실사고가 정확히 그랬다:
 *
 *   "맨유 전임 감독 루벤 디아스"        (실제: 루벤 아모림. 디아스는 맨시티 수비수)
 *   "세리에A에서 활약 중인 루벤 디아스"  (실제: 로프터스-치크. 디아스는 EPL)
 *   "커티스 존스 대체자 트로이 디니"     (실제: 트레이 뇨니. 디니는 은퇴 선수)
 *
 * 사전만 보면 셋 다 "등재된 이름"이라 통과한다. 그런데 **스쿼드를 보면 전부 걸린다.**
 * 사전을 믿지 않는 검사라서 사전 오염 위에서도 동작한다 — 그게 이 검사의 값어치다.
 *
 * ## 규칙 하나
 * 기사에 언급된 팀들의 스쿼드 중 **어디에도 없는 인물**이면 의심한다.
 *
 * 이적 기사처럼 남의 팀 선수를 말하는 경우는 정상이다 — 그때는 그 선수의 팀도
 * 기사에 같이 나온다 ("AC 밀란, **맨시티** 루벤 디아스 영입 검토"). 그래서
 * "언급된 팀 중 하나에 속하면 통과" 로 충분하다.
 *
 * ⚠️ 이 검사는 **의심을 보고할 뿐 확정하지 않는다.** 스쿼드 커버리지가 100%가
 *    아니고(현재 270팀 3,637명), 국가대표·은퇴 선수·유망주는 어느 스쿼드에도 없다.
 *    발행을 막는 자리에 바로 걸면 기사 생산이 통째로 멈춘다 — 이름 가드를 켰다가
 *    초안이 0건이 됐던 2026-08-25 사고가 그 교훈이다. 먼저 관측부터 한다.
 */

export interface SquadIndex {
  /** 한글 선수명 → 그가 속한 팀 id 들 (동명이인·임대 때문에 복수 가능) */
  byPlayer: Map<string, Set<string>>
}

export interface TeamIndex {
  /** 한글 팀명·별칭 → 팀 id */
  byName: Map<string, string>
}

/** 이름·팀명 대조용 정규화 — 공백만 지운다 (한글은 대소문자가 없다) */
export function nameKey(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, "")
    .toLowerCase()
}

export function buildSquadIndex(rows: { name_kr: string | null; soccerway_team_id: string }[]) {
  const byPlayer = new Map<string, Set<string>>()
  for (const r of rows) {
    const k = nameKey(r.name_kr ?? "")
    if (!k || !r.soccerway_team_id) continue
    const set = byPlayer.get(k) ?? new Set<string>()
    set.add(r.soccerway_team_id)
    byPlayer.set(k, set)
  }
  return { byPlayer } satisfies SquadIndex
}

export function buildTeamIndex(
  rows: { soccerway_team_id: string; name_kr: string | null; aliases_kr: string[] | null }[]
) {
  const byName = new Map<string, string>()
  for (const r of rows) {
    if (!r.soccerway_team_id) continue
    for (const n of [r.name_kr, ...(r.aliases_kr ?? [])]) {
      const k = nameKey(n ?? "")
      /**
       * ⚠️ 1글자 별칭은 버린다 — 한국어엔 낱말 경계가 없어 본문 아무 데나 박힌다
       *    (실사고: 인물 사전의 "건"·"번"·"영"이 한국어 낱말 속에서 걸려 기사 생산이 멈췄다).
       *
       *    다만 팀은 **2글자를 살린다.** "맨유"·"밀란"은 가장 흔한 통칭이고, 버리면
       *    정작 맨유 기사에서 팀을 못 잡아 이 검사 자체가 무력해진다. 팀 통칭은
       *    인물 성씨와 달리 흔한 낱말과 겹치지 않는다.
       */
      if (k.length >= 2 && !byName.has(k)) byName.set(k, r.soccerway_team_id)
    }
  }
  return { byName } satisfies TeamIndex
}

/** 본문에 등장하는 팀 id 들 */
export function teamsMentioned(text: string, teams: TeamIndex): Set<string> {
  const flat = nameKey(text)
  const out = new Set<string>()
  for (const [name, id] of teams.byName) {
    if (flat.includes(name)) out.add(id)
  }
  return out
}

/**
 * 본문에 이 이름이 **낱말로** 등장하는가.
 *
 * ⚠️ 단순 `includes` 를 쓰면 안 된다. 한국어엔 낱말 경계가 없어서 짧은 이름이 긴
 *    이름 속에 박힌다 — 실측(2026-08-26, 발행 기사 235건):
 *
 *      "로드리" ⊂ "로드리고 모라"        "안드레" ⊂ "안드레아스 크리스텐센"
 *      "안토니" ⊂ "안토니오"             "레온"   ⊂ "레온 고레츠카"
 *
 *    이 한 줄이 없으면 헛짚음이 22건 나오고, 그중 진짜는 0건이다.
 *    앞뒤 글자가 한글이면 더 긴 이름의 조각이라는 뜻이므로 등장으로 치지 않는다.
 */
export function mentionsPerson(text: string, name: string): boolean {
  const n = String(name ?? "").trim()
  if (!n) return false
  const hangul = /[가-힣]/
  let from = 0
  for (;;) {
    const i = text.indexOf(n, from)
    if (i < 0) return false
    const before = i > 0 ? text[i - 1] : ""
    const after = text[i + n.length] ?? ""
    if (!hangul.test(before) && !hangul.test(after)) return true
    from = i + 1
  }
}

/** 사전 인물 목록 중 본문에 낱말로 등장하는 것만 (긴 이름 우선 — 짧은 조각을 흡수한다) */
export function findPersons(text: string, names: string[]): string[] {
  const sorted = [...names].sort((a, b) => b.length - a.length)
  const hit: string[] = []
  const claimed: string[] = []
  for (const n of sorted) {
    // 이미 잡힌 더 긴 이름의 조각이면 건너뛴다 ("로드리" vs "로드리고 모라")
    if (claimed.some((c) => c.includes(n))) continue
    if (mentionsPerson(text, n)) {
      hit.push(n)
      claimed.push(n)
    }
  }
  return hit
}

export type PersonVerdict =
  /** 언급된 팀 중 하나에 속한다 */
  | { kind: "ok"; person: string }
  /** 스쿼드에 있는데 **언급된 어느 팀에도** 속하지 않는다 — 오염 의심 */
  | { kind: "wrong_team"; person: string; belongsTo: string[] }
  /** 어느 스쿼드에도 없다 — 은퇴·국대·유망주일 수 있어 약한 신호다 */
  | { kind: "not_in_any_squad"; person: string }

export interface PersonTeamReport {
  teamsInArticle: string[]
  verdicts: PersonVerdict[]
  /** 오염 의심 (wrong_team) 만 추린 것 */
  suspects: PersonVerdict[]
}

/**
 * 기사 본문 + 등장인물 목록 → 판정.
 *
 * @param persons 본문에서 뽑은 인물 한글명 (추출은 호출부 책임 — 이 모듈은 대조만 한다)
 */
export function checkPersonsAgainstTeams(
  text: string,
  persons: string[],
  squads: SquadIndex,
  teams: TeamIndex
): PersonTeamReport {
  const inArticle = teamsMentioned(text, teams)
  const verdicts: PersonVerdict[] = []

  for (const raw of persons) {
    const person = String(raw ?? "").trim()
    if (!person) continue
    const teamsOfPerson = squads.byPlayer.get(nameKey(person))

    if (!teamsOfPerson || teamsOfPerson.size === 0) {
      verdicts.push({ kind: "not_in_any_squad", person })
      continue
    }
    const hit = [...teamsOfPerson].some((t) => inArticle.has(t))
    verdicts.push(
      hit ? { kind: "ok", person } : { kind: "wrong_team", person, belongsTo: [...teamsOfPerson] }
    )
  }

  return {
    teamsInArticle: [...inArticle],
    verdicts,
    // ⚠️ 팀이 하나도 안 잡힌 기사(협회·리그 일반 소식)에서는 판정하지 않는다 —
    //    대조할 기준이 없으면 전건이 wrong_team 이 되어 헛짚음만 쏟아진다.
    suspects: inArticle.size === 0 ? [] : verdicts.filter((v) => v.kind === "wrong_team"),
  }
}
