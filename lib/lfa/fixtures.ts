import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { type LfaMatch } from "@/lib/lfa/client"
import { getDayMatches } from "@/lib/lfa/match"
import { BETMAN_CODE_BY_LFA_ID } from "@/lib/lfa/leagues"
import { MATCH_PAGE_LEAGUES } from "@/lib/match/leagues"

/**
 * 일정의 정본 — 대상 리그 전 경기 (2026-08-17).
 *
 * ## 왜 betman 이 정본이 될 수 없나
 * betman 은 **베팅 마켓이 열린 경기만** 싣는다. 2026-08-17 실측: 향후 일정이 이틀치뿐이고
 * EPL 개막 라운드(8/22)·라리가 2R 이 통째로 없었다. 일정 페이지를 betman 으로 채우면
 * "5대 리그·유럽 대항전 전 경기"라는 요구를 구조적으로 만족할 수 없다 (운영자 제보).
 * LFA 는 같은 날짜에 EPL 개막 17경기를 갖고 있다 — 그래서 일정은 LFA 가 정본이다.
 *
 * betman 은 여전히 필요하다: 매치 페이지·라인업이 `betman_games.id` 로 걸려 있고
 * 예측/베팅 동선이 거기서 나온다. 그래서 **LFA 를 기준으로 betman 을 붙이는** 방향이다.
 *
 * ## 팀명
 * LFA 는 영문이므로 `team_dictionary`(name_en → name_kr) 를 역인덱스로 뒤집어 한글화한다.
 * 사전에 없으면 영문 그대로 — 한글 원칙보다 "경기가 목록에 있는 것"이 우선이다.
 */

export interface LfaFixture {
  /** LFA 경기 id — betman 이 없는 경기의 유일한 키 */
  lfaId: string
  /** betman league_code (대상 리그로 이미 걸러진 상태) */
  leagueCode: string
  homeTeam: string
  awayTeam: string
  /**
   * LFA 영문 원명 (2026-09-02). 짝짓기의 영문 대조는 **이 값**으로 한다 — homeTeam 은 사전을 거쳐
   * 한글이 된 뒤라, 사전 표기("셀타 비고")와 betman 표기("RC셀타데비고")가 다르면 접두도 안 겹치고
   * 영문 대조도 한글을 받아 죽는다. 그날 레알 소시에다드–셀타가 그렇게 링크를 잃었다.
   */
  homeTeamEn: string
  awayTeamEn: string
  /** UTC ISO — betman match_time 과 같은 축 */
  matchTime: string
  status: "scheduled" | "in_progress" | "completed" | "cancelled"
  homeScore: number | null
  awayScore: number | null
}

/**
 * 한글 표기 조회 재료 — **LFA 팀 해시 우선**, 이름 대조는 폴백.
 *
 * LFA 는 축약형·타 언어 표기를 섞어 쓴다 ("Man. City", "Not. Forest", "Bayern Münih").
 * 이름으로 대조하면 이미 사전에 있는 팀도 못 찾는다 (2026-08-17 실측: 470팀 중 27팀).
 * `team_dictionary.lfa_team_id` 가 채워진 팀은 ID 하나로 끝나므로 표기 변형을 안 탄다.
 */
const cachedKoIndex = unstable_cache(
  async (): Promise<{ byLfaId: [string, string][]; byEn: [string, string][] }> => {
    const { data } = await createServiceRoleClient()
      .from("team_dictionary")
      .select("name_en, name_kr, lfa_team_id")
      .neq("status", "rejected")
      .not("name_kr", "is", null)
    const byLfaId: [string, string][] = []
    const byEn: [string, string][] = []
    for (const r of data ?? []) {
      const kr = String(r.name_kr ?? "").trim()
      if (!kr) continue
      const lfaId = String(r.lfa_team_id ?? "").trim()
      if (lfaId) byLfaId.push([lfaId, kr])
      const en = String(r.name_en ?? "").trim()
      if (en) byEn.push([normEn(en), kr])
    }
    return { byLfaId, byEn }
  },
  ["lfa-ko-index-v2"],
  { revalidate: 3600 }
)

function normEn(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

/**
 * LFA 팀 → 한글. **팀 해시가 있으면 그것만 본다** (표기 변형 무관).
 * 해시가 아직 안 붙은 팀만 이름 대조로 내려가고, 후보가 여럿이면 영문을 유지한다 —
 * 엉뚱한 팀 이름이 붙는 것이 최악이다.
 */
function toKorean(
  team: { id?: string; name?: string } | undefined,
  index: { byLfaId: [string, string][]; byEn: [string, string][] }
): string {
  const nameEn = String(team?.name ?? "")
  const id = String(team?.id ?? "")
  if (id) {
    const hit = index.byLfaId.find(([lfaId]) => lfaId === id)
    if (hit) return hit[1]
  }
  const n = normEn(nameEn)
  if (!n) return nameEn
  const exact = index.byEn.filter(([en]) => en === n)
  if (exact.length === 1) return exact[0][1]
  // ⚠️ 접두 대조는 짧은 쪽이 7자 이상일 때만 — "Inter"(5자, 인테르나치오날레의 name_en)가
  //    "Inter Turku"의 접두라서 핀란드 인터 투르쿠가 인테르로 표기됐다 (2026-08-20 운영자
  //    제보). 짧은 이름은 정확일치·lfa_team_id 직결로만 잇는다 — 틀린 한글보다 원문이 낫다.
  const partial = index.byEn.filter(([en]) => {
    const [s, l] = en.length <= n.length ? [en, n] : [n, en]
    return s.length >= 7 && l.startsWith(s)
  })
  return partial.length === 1 ? partial[0][1] : nameEn
}

function toStatus(m: LfaMatch): LfaFixture["status"] {
  const state = m.status?.state ?? ""
  const display = String(m.status?.display ?? "").toUpperCase()
  if (state === "postGame" || display === "FT" || display === "AET" || display === "PEN") {
    return "completed"
  }
  if (m.status?.is_live) return "in_progress"
  if (/POSTP|CANC|ABAN/.test(display) || state === "cancelled") return "cancelled"
  return "scheduled"
}

/** LFA kickoff("14:00") + UTC 날짜 → ISO */
function toIso(dateUtc: string, kickoff: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(kickoff)) return null
  return `${dateUtc}T${kickoff}:00.000Z`
}

/**
 * ⚠️ 여기서 직접 LFA 를 부르지 않는다 (2026-08-24 크레딧 감사).
 *
 * 종전엔 이 파일이 `matches?date=` 를 **자기 몫으로 한 번 더** 받았다. `lib/lfa/match.ts` 가
 * 같은 응답(221KB)을 이미 받아 DB(`lfa_day_cache`)에 눕히고 있는데도, 일정 페이지·홈 밴드·
 * 불판 cron·MoTM cron 이 타는 이 경로만 `unstable_cache` 5분짜리로 따로 돌아 **같은 날짜를
 * 두 번 사고** 있었다. 배포마다 초기화되니 잦은 배포일수록 더 샜다.
 *
 * 이제 두 경로가 DB 한 줄을 공유한다 — 하루치 목록은 무슨 일이 있어도 한 번만 산다.
 */
async function cachedDay(dateUtc: string, ttl: number) {
  return getDayMatches(dateUtc, ttl === 300)
}

/**
 * 매치데이(KST 06:00~다음날 06:00) 대상 리그 전 경기.
 * KST 하루가 UTC 두 날짜에 걸치므로 최대 2콜 — 그 2콜이 그날 전 경기를 덮는다.
 */
export async function getLfaFixturesForMatchday(dateKst: string): Promise<LfaFixture[]> {
  try {
    const startMs = new Date(`${dateKst}T06:00:00+09:00`).getTime()
    if (!Number.isFinite(startMs)) return []
    const endMs = startMs + 24 * 3600_000
    const now = Date.now()
    // 진행 중인 매치데이만 짧게 — 지난 날·미래 날은 값이 굳어 있다
    const ttl = now >= startMs && now <= endMs ? 300 : 12 * 3600

    const dates = [
      new Date(startMs).toISOString().slice(0, 10),
      new Date(endMs - 1).toISOString().slice(0, 10),
    ]
    const index = await cachedKoIndex().catch(() => ({ byLfaId: [], byEn: [] }))

    const out: LfaFixture[] = []
    for (const d of [...new Set(dates)]) {
      for (const m of await cachedDay(d, ttl)) {
        const code = BETMAN_CODE_BY_LFA_ID.get(m.league?.id ?? "")
        if (!code || !MATCH_PAGE_LEAGUES.has(code)) continue
        const iso = toIso(d, m.kickoff)
        if (!iso) continue
        const t = new Date(iso).getTime()
        if (t < startMs || t >= endMs) continue // 다른 매치데이 소속
        const toNum = (v: string | null | undefined) => {
          const n = Number(v)
          return v != null && v !== "" && Number.isFinite(n) ? n : null
        }
        out.push({
          lfaId: m.id,
          leagueCode: code,
          homeTeam: toKorean(m.home, index),
          awayTeam: toKorean(m.away, index),
          homeTeamEn: String(m.home?.name ?? ""),
          awayTeamEn: String(m.away?.name ?? ""),
          matchTime: iso,
          status: toStatus(m),
          homeScore: toNum(m.home?.score),
          awayScore: toNum(m.away?.score),
        })
      }
    }
    return out.sort((a, b) => a.matchTime.localeCompare(b.matchTime))
  } catch {
    return [] // fail-open — 호출부가 betman 목록만으로 그린다
  }
}
