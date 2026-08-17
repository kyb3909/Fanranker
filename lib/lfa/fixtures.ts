import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { lfaFetch, type LfaMatch } from "@/lib/lfa/client"
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
  /** UTC ISO — betman match_time 과 같은 축 */
  matchTime: string
  status: "scheduled" | "in_progress" | "completed" | "cancelled"
  homeScore: number | null
  awayScore: number | null
}

/** name_en(정규화) → name_kr. 1시간 캐시 */
const cachedKoByEn = unstable_cache(
  async (): Promise<[string, string][]> => {
    const { data } = await createServiceRoleClient()
      .from("team_dictionary")
      .select("name_en, name_kr")
      .neq("status", "rejected")
      .not("name_kr", "is", null)
    const out: [string, string][] = []
    for (const r of data ?? []) {
      const en = String(r.name_en ?? "").trim()
      const kr = String(r.name_kr ?? "").trim()
      if (en && kr) out.push([normEn(en), kr])
    }
    return out
  },
  ["lfa-ko-by-en"],
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
 * LFA 영문 팀명 → 한글. 축약형이라 정확일치가 자주 실패하므로
 * (LFA "Man. United" vs 사전 "Manchester United") 접두 포함까지 본다.
 * 후보가 여럿이면 한글화하지 않는다 — 엉뚱한 팀 이름이 붙는 것이 최악이다.
 */
function toKorean(nameEn: string, index: [string, string][]): string {
  const n = normEn(nameEn)
  if (!n) return nameEn
  const exact = index.filter(([en]) => en === n)
  if (exact.length === 1) return exact[0][1]
  const partial = index.filter(([en]) => en.startsWith(n) || n.startsWith(en))
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

function cachedDay(dateUtc: string, ttl: number) {
  return unstable_cache(
    async () => {
      const data = await lfaFetch<{ matches?: LfaMatch[] }>("matches", {
        date: dateUtc,
        lang: "en",
      })
      return data?.matches ?? []
    },
    ["lfa-day", dateUtc, ttl === 300 ? "live" : "settled"],
    { revalidate: ttl }
  )
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
    const index = await cachedKoByEn().catch(() => [] as [string, string][])

    const out: LfaFixture[] = []
    for (const d of [...new Set(dates)]) {
      for (const m of await cachedDay(d, ttl)()) {
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
          homeTeam: toKorean(m.home?.name ?? "", index),
          awayTeam: toKorean(m.away?.name ?? "", index),
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
