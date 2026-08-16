/**
 * soccerway 팀 스쿼드 — 팀 페이지 `/team/{slug}/{id}/squad/` 의 SSR HTML 파싱 계층.
 *
 * 라인업(lineup.ts)과 달리 스쿼드는 **정적 HTML 에 통째로 들어있다** (2026-08-16 실측,
 * 아스날 hA1Zm19f 검증 — lineupTable__row 63행, plain fetch 200). GraphQL 캡처가 필요 없다.
 *
 * 규율은 lineup.ts 와 동일: DB 의존 0, 실패는 null (fail-open). 소비처는
 * scripts/harvest-squads.ts (배치 수확) — 런타임 경로에서 부르지 않는다.
 */

const FETCH_HEADERS = {
  "Accept-Language": "en-GB,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}

export interface SquadMember {
  playerId: string // soccerway 해시 (예: EgIM3sB7)
  playerSlug: string // 예: saliba-william
  nameEn: string // soccerway 표기 (성 이름 순, 예: "Saliba William")
  jerseyNumber: number | null
  position: "GK" | "DF" | "MF" | "FW" | "COACH"
}

const SECTION_MAP: Record<string, SquadMember["position"]> = {
  Goalkeepers: "GK",
  Defenders: "DF",
  Midfielders: "MF",
  Forwards: "FW",
  Coach: "COACH",
}

/** HTML → 스쿼드. 파싱 실패·빈 결과는 null. */
function parseSquadHtml(html: string): SquadMember[] | null {
  // ⚠️ 페이지에는 lineupTable 이 여럿이다 — 스쿼드 본표 외에 "직전 경기 라인업" 위젯도
  //    같은 클래스를 쓴다(실측: 아스날 페이지에 리즈 선수 혼입). 첫 Goalkeepers 헤더부터
  //    두 번째 Goalkeepers 직전까지만 스쿼드로 본다.
  const headerRe = /lineupTable__title[^>]*>([^<]+)</g
  const headers: { idx: number; pos: SquadMember["position"] }[] = []
  for (let m = headerRe.exec(html); m; m = headerRe.exec(html)) {
    const pos = SECTION_MAP[m[1].trim()]
    if (pos) headers.push({ idx: m.index, pos })
  }
  const firstGk = headers.find((h) => h.pos === "GK")
  if (!firstGk) return null
  const secondGk = headers.find((h) => h.pos === "GK" && h.idx > firstGk.idx)
  const start = firstGk.idx
  const end = secondGk ? secondGk.idx : html.length
  const scoped = headers.filter((h) => h.idx >= start && h.idx < end)

  // 행 단위로 쪼개 각 청크에서 등번호·선수 링크를 따로 뽑는다 (한 정규식은 취약했다)
  const byId = new Map<string, SquadMember>()
  const slice = html.slice(start, end)
  const chunks = slice.split(/class="[^"]*lineupTable__row[^"]*"/).slice(1)
  let cursor = start
  for (const chunk of chunks) {
    cursor = html.indexOf(chunk, cursor)
    const link = chunk.match(
      /href="\/player\/([a-z0-9-]+)\/([A-Za-z0-9]+)\/"[^>]*>\s*([^<]{2,60}?)\s*</
    )
    if (!link) continue
    const jersey = chunk.match(/lineupTable__cell--jersey[^>]*>\s*(\d{1,3})\s*</)
    let pos: SquadMember["position"] = "FW"
    for (const h of scoped) if (h.idx <= cursor) pos = h.pos
    const member: SquadMember = {
      playerId: link[2],
      playerSlug: link[1],
      nameEn: link[3].trim().replace(/\s+/g, " "),
      jerseyNumber: jersey ? Number(jersey[1]) : null,
      position: pos,
    }
    if (!byId.has(member.playerId)) byId.set(member.playerId, member)
  }
  return byId.size > 0 ? [...byId.values()] : null
}

/** 팀 스쿼드 fetch — team_dictionary 의 slug + soccerway_team_id 조합 */
export async function fetchTeamSquad(slug: string, teamId: string): Promise<SquadMember[] | null> {
  try {
    const res = await fetch(`https://www.soccerway.com/team/${slug}/${teamId}/squad/`, {
      headers: FETCH_HEADERS,
    })
    if (!res.ok) return null
    return parseSquadHtml(await res.text())
  } catch {
    return null
  }
}
