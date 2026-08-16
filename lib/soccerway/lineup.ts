/**
 * soccerway 라인업 — Livesport persisted query 로 가져오는 순수 fetch/파싱 계층.
 *
 * ## 데이터 경로 (2026-08-16 실측, Sheffield Utd v Birmingham 으로 검증)
 * soccerway 신판은 전면 SPA 라 정적 HTML 에 라인업이 없다. 대신 프론트가
 * `2020.ds.lsapp.eu/pq_graphql` (Livesport persisted query) 를 부르고, 이 API 는
 * **UA + Referer 만 있으면 plain fetch 로 열린다** — 런타임 헤드리스가 필요 없다.
 * 같은 Livesport API 를 team-search.ts 가 이미 Vercel 에서 쓰고 있다(선례).
 *
 * ## 이 파일의 규율
 * - DB·Supabase·next/cache 의존 0 — 테스트와 probe 스크립트가 그대로 부른다.
 * - 실패는 전부 null 로 삼킨다(fail-open). 라인업은 곁들이 정보라 어떤 실패도
 *   화면 오류로 번지면 안 된다.
 *
 * ⚠️ `LINEUP_HASH` 는 soccerway 프론트의 persisted query id 다. 그쪽 배포로 언제든
 *    바뀔 수 있다 — 바뀌면 응답이 400 이 되고 전 경로가 조용히 none 으로 접힌다.
 *    복구는 헤드리스로 LINEUPS 탭을 한 번 열어 pq_graphql 호출을 다시 캡처한 뒤
 *    이 상수 한 줄을 교체하면 끝이다 (scripts/probe-lineup.ts 참조).
 */

/** Livesport persisted query id — 라인업 본체 (findEventById + eventParticipants.lineup) */
export const LINEUP_HASH = "dlie2"

const GRAPHQL_BASE = "https://2020.ds.lsapp.eu/pq_graphql"
const PROJECT_ID = "2020" // soccerway 의 Livesport project id (team-search.ts 와 동일)

/** team-search.ts 와 같은 조합 — Vercel 아웃바운드에서 동작 검증된 헤더 */
const FETCH_HEADERS = {
  Accept: "application/json",
  "Accept-Language": "en-GB,en;q=0.9",
  Referer: "https://www.soccerway.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}

export interface LineupPlayer {
  /** 표시용 이름 — listName("Cooper M.") 우선, 없으면 fieldName */
  name: string
  /**
   * 로마자 신원 질의용 풀네임 — participant.url 슬러그("cooper-michael")를 공백 분리.
   * listName 은 이니셜 축약이라 동명이인 판정이 약하다. 한글화는 lookup 계층의 몫.
   */
  romanizedFull: string | null
  /** 한글 표기 (lookup 계층이 사전 대조 후 채움 — 없으면 로마자 그대로 노출) */
  nameKo?: string
  number: number | null
  /* 인시던트 (2026-08-16) — dlie2 의 선수별 incidents. 라인업 아이콘 표시용 */
  goals?: number
  /** 득점 시각들 ("57'", "73'") — goals 와 같은 순서 */
  goalMinutes?: string[]
  ownGoals?: number
  red?: boolean
  /** 교체 아웃 시각 ("65'") — 선발이 빠진 경우 */
  subOut?: string | null
  /** 교체 인 시각 — 벤치에서 들어온 경우 (상대 선수의 SubstitutionOut.playerInId 로 역산) */
  subIn?: string | null
  /** 교체 상대 로마자 슬러그 — lookup 계층이 한글 라벨로 해석 */
  subPartnerRoman?: string | null
  /** 교체 상대 원표기 (라벨 해석 실패 시 폴백) */
  subPartnerName?: string
}

interface LineupSide {
  /** Livesport 참가팀명 (영문, 예: "Sheffield Utd") — 홈/원정 배치 대조의 근거 */
  teamNameEn: string
  side: "HOME" | "AWAY"
  formation: string | null
  starters: LineupPlayer[]
  bench: LineupPlayer[]
}

export interface RawLineup {
  home: LineupSide
  away: LineupSide
}

/* ── 파싱 ── */

interface RawIncident {
  __typename?: string
  incident?: { minute?: string | null } | null
  playerInId?: string | null
}

interface RawPlayer {
  id?: string
  fieldName?: string
  listName?: string
  number?: string | number | null
  participant?: { url?: string | null } | null
  incidents?: RawIncident[]
}

function toPlayer(p: RawPlayer): LineupPlayer | null {
  const name = (p.listName || p.fieldName || "").trim()
  if (!name) return null
  const slug = p.participant?.url ?? null
  const num = p.number != null && String(p.number).trim() !== "" ? Number(p.number) : null

  // 인시던트 — typename 부분 문자열로 판정 (실측: EventIncidentGoal / EventIncidentYellowCard /
  // EventIncidentSubstitutionOut{playerInId} / RedCard 계열은 YellowRedCard 포함 "RedCard" 매칭)
  let goals = 0
  const goalMinutes: string[] = []
  let ownGoals = 0
  let red = false
  let subOut: string | null = null
  for (const inc of p.incidents ?? []) {
    const t = inc.__typename ?? ""
    const minute = inc.incident?.minute ?? null
    if (t.includes("OwnGoal")) ownGoals++
    else if (t.includes("Goal")) {
      goals++
      if (minute) goalMinutes.push(minute)
    } else if (t.includes("RedCard")) red = true
    else if (t.includes("SubstitutionOut")) subOut = minute
  }

  return {
    name,
    // "cooper-michael" → "cooper michael" (성-이름 순이지만 토큰 매칭이라 순서 무관)
    romanizedFull: slug ? slug.replace(/-/g, " ").trim() || null : null,
    number: Number.isFinite(num) ? num : null,
    ...(goals > 0 ? { goals, goalMinutes } : {}),
    ...(ownGoals > 0 ? { ownGoals } : {}),
    ...(red ? { red } : {}),
    ...(subOut ? { subOut } : {}),
  }
}

/**
 * dlie2 응답 → RawLineup. 모양이 조금이라도 어긋나면 null (fail-open).
 * 선발이 정확히 11명이 아니면 발표 전 부분 데이터로 보고 null — 반쪽 라인업을
 * 내보내느니 안 보여주는 게 낫다.
 */
export function parseLineupPayload(json: unknown): RawLineup | null {
  try {
    const ev = (json as { data?: { findEventById?: { eventParticipants?: unknown[] } } })?.data
      ?.findEventById
    const parts = ev?.eventParticipants
    if (!Array.isArray(parts) || parts.length < 2) return null

    const sides: Partial<Record<"HOME" | "AWAY", LineupSide>> = {}
    for (const raw of parts) {
      const ep = raw as {
        name?: string
        type?: { side?: string }
        lineup?: {
          formation?: { name?: string | null } | null
          players?: RawPlayer[]
          groups?: { groupType?: string; playerIds?: string[] }[]
        } | null
      }
      const side = ep.type?.side
      if (side !== "HOME" && side !== "AWAY") continue
      const lu = ep.lineup
      if (!lu?.players || !lu.groups) return null

      const byId = new Map<string, RawPlayer>()
      for (const p of lu.players) if (p.id) byId.set(p.id, p)

      // 교체 연결 — SubstitutionOut 의 playerInId 로 양방향 상대를 잇는다
      // (들어온 선수 쪽엔 기록이 없어 역산 필수. 동시 교체가 있어 분(minute)으로는 못 잇는다)
      const rawName = (p: RawPlayer | undefined) => (p?.listName || p?.fieldName || "").trim()
      const rawRoman = (p: RawPlayer | undefined) =>
        p?.participant?.url ? p.participant.url.replace(/-/g, " ").trim() || null : null
      const subLink = new Map<
        string,
        { subIn?: string | null; partnerRoman: string | null; partnerName: string }
      >()
      for (const p of lu.players) {
        for (const inc of p.incidents ?? []) {
          if ((inc.__typename ?? "").includes("SubstitutionOut") && inc.playerInId && p.id) {
            const q = byId.get(inc.playerInId)
            const minute = inc.incident?.minute ?? ""
            subLink.set(p.id, { partnerRoman: rawRoman(q), partnerName: rawName(q) })
            subLink.set(inc.playerInId, {
              subIn: minute || null,
              partnerRoman: rawRoman(p),
              partnerName: rawName(p),
            })
          }
        }
      }

      const pick = (groupType: string): LineupPlayer[] => {
        const g = lu.groups!.find((x) => x.groupType === groupType)
        if (!g?.playerIds) return []
        const out: LineupPlayer[] = []
        for (const id of g.playerIds) {
          const p = byId.get(id)
          const player = p ? toPlayer(p) : null
          if (player) {
            const link = subLink.get(id)
            if (link) {
              if (link.subIn !== undefined) player.subIn = link.subIn
              player.subPartnerRoman = link.partnerRoman
              player.subPartnerName = link.partnerName
            }
            out.push(player)
          }
        }
        return out
      }

      const starters = pick("STARTERS")
      if (starters.length !== 11) return null // 발표 전 부분 데이터
      sides[side] = {
        teamNameEn: (ep.name ?? "").trim(),
        side,
        formation: lu.formation?.name ?? null,
        starters,
        bench: pick("SUBSTITUTES"),
      }
    }

    if (!sides.HOME || !sides.AWAY) return null
    return { home: sides.HOME, away: sides.AWAY }
  } catch {
    return null
  }
}

/* ── fetch ── */

/** eventId 로 라인업 조회. 미발표·형식 파손·네트워크 실패 전부 null. */
export async function fetchLineup(eventId: string): Promise<RawLineup | null> {
  if (!/^[A-Za-z0-9]{6,12}$/.test(eventId)) return null
  try {
    const url = `${GRAPHQL_BASE}?_hash=${LINEUP_HASH}&eventId=${encodeURIComponent(eventId)}&projectId=${PROJECT_ID}`
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    return parseLineupPayload(await res.json())
  } catch {
    return null
  }
}
