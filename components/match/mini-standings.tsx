import Link from "@/components/ui/app-link"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { teamMatchScore } from "@/lib/namu/team-match"
import { displayTeamName, loadTeamShortMap } from "@/lib/match/team-display"

/**
 * 매치센터 미니 순위표 (2026-08-19 팬 패널 A8 — "이 결과로 몇 위인지가 안 보인다").
 *
 * 그 경기 두 팀 주변 행만 오려 보여준다 (FotMob 문법). 데이터는 순위 페이지와 같은
 * `standings_cache` — 추가 외부 호출 0. 전체 표는 `/standings/[league]` 로 잇는다
 * (순위 → 경기 크로스링크 부재 지적의 절반을 여기서 메꾼다).
 *
 * fail-open: 대상 리그가 아니거나(컵·대항전), 표가 없거나, 개막 전(전 팀 0)이거나,
 * 두 팀 다 대조가 안 되면 조용히 사라진다.
 */

/** betman league_code → 순위 캐시 id + 페이지 slug (5대 리그만 — 순위 페이지와 동일 범위) */
const STANDINGS_LEAGUE: Record<string, { id: string; slug: string }> = {
  EPL: { id: "epl", slug: "epl" },
  라리가: { id: "laliga", slug: "laliga" },
  세리에A: { id: "seriea", slug: "seriea" },
  분데스리: { id: "bundesliga", slug: "bundesliga" },
  프리그1: { id: "ligue1", slug: "ligue1" },
}

interface StandingRow {
  팀명?: string
  경기?: number
  승?: number
  무?: number
  패?: number
  승점?: number
  골득실?: number
}

/** 팀명 대조 — 출처 표기가 흔들려("데포르티보 라 코루냐 A") 토큰 대조 + 최고점 단독만 */
function findTeamIndex(rows: StandingRow[], teamKr: string): number {
  let best = 0
  let bestIdx = -1
  let tied = 0
  rows.forEach((r, i) => {
    const score = teamMatchScore(String(r.팀명 ?? ""), teamKr, [])
    if (score === 0) return
    if (score > best) {
      best = score
      bestIdx = i
      tied = 1
    } else if (score === best) {
      tied++
    }
  })
  return tied === 1 ? bestIdx : -1
}

export async function MatchMiniStandings({
  leagueCode,
  homeTeam,
  awayTeam,
}: {
  leagueCode: string
  /** 대조용 원문 팀명 — 통칭을 넘기면 토큰이 부족해 대조가 약해진다 */
  homeTeam: string
  awayTeam: string
}) {
  const league = STANDINGS_LEAGUE[leagueCode]
  if (!league) return null

  let rows: StandingRow[] = []
  try {
    const { data } = await createServiceRoleClient()
      .from("standings_cache")
      .select("data")
      .eq("league_id", league.id)
      .maybeSingle()
    rows = Array.isArray(data?.data) ? (data.data as StandingRow[]) : []
  } catch {
    return null
  }
  // 개막 전(전 팀 0)의 "순위" 는 그냥 가나다순이다 — 지면에 올리면 오독만 만든다
  if (rows.length === 0 || rows.every((r) => (Number(r.경기) || 0) === 0)) return null

  const hi = findTeamIndex(rows, homeTeam)
  const ai = findTeamIndex(rows, awayTeam)
  if (hi < 0 && ai < 0) return null

  // 두 팀 각각 ±1 행을 오려 합친다 — 사이가 벌어지면 … 로 잇는다
  const picked = new Set<number>()
  for (const idx of [hi, ai]) {
    if (idx < 0) continue
    for (const j of [idx - 1, idx, idx + 1]) {
      if (j >= 0 && j < rows.length) picked.add(j)
    }
  }
  const indices = [...picked].sort((a, b) => a - b)
  const shortNames = await loadTeamShortMap()

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="sheet-lab">순위</h2>
        <Link
          href={`/standings/${league.slug}`}
          className="text-[12px] font-bold no-underline"
          style={{ color: "var(--wc-burgundy)" }}
        >
          전체 순위 →
        </Link>
      </div>
      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr style={{ color: "var(--wc-mute-2)" }}>
            <th className="w-8 py-1.5 text-right text-[11px] font-bold">#</th>
            <th className="py-1.5 pl-3 text-left text-[11px] font-bold">팀</th>
            {["경기", "득실", "승점"].map((h) => (
              <th key={h} className="w-11 py-1.5 text-right text-[11px] font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {indices.map((idx, k) => {
            const r = rows[idx]
            const isMatchTeam = idx === hi || idx === ai
            const gd = Number(r.골득실) || 0
            const gap = k > 0 && indices[k - 1] !== idx - 1
            return (
              <tr
                key={idx}
                style={{
                  borderTop: gap ? "1px dashed var(--wc-line-2)" : "1px solid var(--wc-line)",
                  background: isMatchTeam ? "var(--wc-soft)" : undefined,
                }}
              >
                <td
                  className="gn-num py-2 text-right text-[12.5px] font-bold"
                  style={{ color: "var(--wc-mute-2)" }}
                >
                  {idx + 1}
                </td>
                <td
                  className={`truncate py-2 pl-3 text-[13px] ${isMatchTeam ? "font-extrabold" : "font-semibold"}`}
                  style={{ color: "var(--wc-ink)" }}
                >
                  {r.팀명 ? displayTeamName(r.팀명, shortNames) : "-"}
                </td>
                <td
                  className="gn-num py-2 text-right text-[12.5px]"
                  style={{ color: "var(--wc-mute)" }}
                >
                  {Number(r.경기) || 0}
                </td>
                <td
                  className="gn-num py-2 text-right text-[12.5px]"
                  style={{ color: "var(--wc-mute)" }}
                >
                  {gd > 0 ? `+${gd}` : gd}
                </td>
                <td
                  className="gn-num py-2 text-right text-[13px] font-extrabold"
                  style={{ color: "var(--wc-ink)" }}
                >
                  {Number(r.승점) || 0}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
