import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "@/components/ui/app-link"
import { PageBand, PageBandStat } from "@/components/page-band"
import { MatchHubTabs } from "@/components/match/hub-tabs"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { displayTeamName, loadTeamShortMap } from "@/lib/match/team-display"

/**
 * 리그 순위표 — `/standings/[league]` (2026-08-19 운영자 요청).
 *
 * ## 왜 자기 URL 인가
 * "프리미어리그 순위"·"라리가 순위"는 검색량이 큰 질의이고, **비로그인 상태로 가치가
 * 완결되는** 몇 안 되는 화면이다. 탭 상태를 쿼리로 숨기면 그 유입을 못 받는다.
 * 그래서 리그마다 경로를 갖고 제목·설명도 리그별로 다르게 낸다.
 *
 * ## 데이터
 * `standings_cache` (네이버 스포츠 → cron 적재)를 그대로 읽는다. 팀명이 이미 한글이라
 * 사전을 태울 필요가 없다. 키가 한글이다: 팀명·경기·승·무·패·승점·골득실.
 * 개막 전에는 전 팀 0 — 그것도 정상 화면이다 (빈 표를 감추면 페이지가 죽은 것처럼 보인다).
 */

/** 지면에 세울 리그 — 5대 리그만 (K리그·J리그는 승부예측 전용, 2026-08-19 운영자) */
const LEAGUES = [
  { slug: "epl", id: "epl", label: "프리미어리그", short: "EPL" },
  { slug: "laliga", id: "laliga", label: "라리가", short: "LaLiga" },
  { slug: "seriea", id: "seriea", label: "세리에 A", short: "Serie A" },
  { slug: "bundesliga", id: "bundesliga", label: "분데스리가", short: "Bundesliga" },
  { slug: "ligue1", id: "ligue1", label: "리그 1", short: "Ligue 1" },
] as const

type LeagueSlug = (typeof LEAGUES)[number]["slug"]

function findLeague(slug: string) {
  return LEAGUES.find((l) => l.slug === slug)
}

export const revalidate = 300

export function generateStaticParams() {
  return LEAGUES.map((l) => ({ league: l.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ league: string }>
}): Promise<Metadata> {
  const { league } = await params
  const meta = findLeague(league)
  if (!meta) return { title: "순위" }
  return {
    title: `${meta.label} 순위`,
    description: `${meta.label} 승점·득실차 순위표. 경기 일정과 결과도 함께 봅니다.`,
    alternates: { canonical: `/standings/${meta.slug}` },
  }
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

async function getRows(
  leagueId: string
): Promise<{ rows: StandingRow[]; fetchedAt: string | null }> {
  try {
    const { data } = await createServiceRoleClient()
      .from("standings_cache")
      .select("data, fetched_at")
      .eq("league_id", leagueId)
      .maybeSingle()
    const rows = Array.isArray(data?.data) ? (data.data as StandingRow[]) : []
    return { rows, fetchedAt: (data?.fetched_at as string | null) ?? null }
  } catch {
    return { rows: [], fetchedAt: null }
  }
}

/**
 * 순위권 색 띠 — 왼쪽 액센트 보더는 금지라 **순위 숫자 자체**에만 색을 준다.
 * ⚠️ 개막 전(started=false)에는 색을 끈다 — 전 팀 0 인 "순위" 는 그냥 가나다순인데
 *    거기에 진출권·강등 색을 입히면 오독만 만든다 (2026-08-19 감리 C-3).
 */
function rankTone(rank: number, total: number, started: boolean): string {
  if (!started) return "var(--wc-mute-2)"
  if (rank <= 4) return "var(--wc-blue)" // 챔피언스리그
  if (rank > total - 3) return "var(--wc-down)" // 강등권
  return "var(--wc-mute-2)"
}

function fmtUpdated(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
}

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ league: LeagueSlug }>
}) {
  const { league } = await params
  const meta = findLeague(league)
  if (!meta) notFound()

  const [{ rows, fetchedAt }, shortNames] = await Promise.all([
    getRows(meta.id),
    loadTeamShortMap(),
  ])
  const played = rows.reduce((sum, r) => sum + (Number(r.경기) || 0), 0)
  const updated = fmtUpdated(fetchedAt)

  return (
    <div className="min-h-[80vh]" style={{ background: "var(--wc-paper)" }}>
      <PageBand
        kicker="STANDINGS"
        title="순위"
        description="유럽 5대 리그 승점·득실차"
        aside={<PageBandStat label="리그" value={String(LEAGUES.length)} />}
      />

      <main className="mx-auto max-w-[720px] px-0 pt-4 pb-16 sm:px-6">
        <MatchHubTabs active="standings" />

        {/* 리그 선택 — 일정 페이지의 날짜 칩과 같은 문법 */}
        <nav className="wc-chip-tabs mt-4" aria-label="리그 선택">
          {LEAGUES.map((l) => (
            <Link
              key={l.slug}
              href={`/standings/${l.slug}`}
              aria-current={l.slug === meta.slug ? "page" : undefined}
              className={`no-underline ${l.slug === meta.slug ? "on" : ""}`}
            >
              <span className="font-bold">{l.label}</span>
            </Link>
          ))}
        </nav>

        <div className="px-4 sm:px-0">
          <div className="mt-6 flex items-baseline gap-2.5">
            <h2
              className="text-[22px] leading-none"
              style={{
                fontFamily: "var(--font-display-ko), var(--font-title)",
                fontWeight: 700,
                color: "var(--wc-ink)",
                letterSpacing: "-0.03em",
              }}
            >
              {meta.label}
            </h2>
            {updated && (
              <span className="text-[12px] font-bold" style={{ color: "var(--wc-mute)" }}>
                {updated} 기준
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <p
              className="mt-4 rounded-xl px-4 py-10 text-center text-[13.5px]"
              style={{
                background: "var(--wc-card)",
                border: "1px solid var(--wc-line)",
                color: "var(--wc-mute)",
              }}
            >
              순위표를 준비 중입니다.
            </p>
          ) : (
            <>
              {played === 0 && (
                <p className="mt-2 text-[12.5px]" style={{ color: "var(--wc-mute-2)" }}>
                  아직 개막 전입니다 — 첫 라운드가 끝나면 채워집니다.
                </p>
              )}
              {/* 표는 좁은 화면에서 가로로만 스크롤한다 (지면 전체가 흔들리지 않게) */}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[440px] border-collapse">
                  <thead>
                    <tr style={{ color: "var(--wc-mute-2)" }}>
                      <th className="w-8 py-2 text-right text-[11px] font-bold">#</th>
                      <th className="py-2 pl-3 text-left text-[11px] font-bold">팀</th>
                      {["경기", "승", "무", "패", "득실", "승점"].map((h) => (
                        <th key={h} className="w-10 py-2 text-right text-[11px] font-bold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const rank = i + 1
                      const gd = Number(r.골득실) || 0
                      return (
                        <tr
                          key={`${r.팀명}-${i}`}
                          style={{ borderTop: "1px solid var(--wc-line)" }}
                        >
                          <td
                            className="gn-num py-2.5 text-right text-[13px] font-bold"
                            style={{ color: rankTone(rank, rows.length, played > 0) }}
                          >
                            {rank}
                          </td>
                          <td
                            className="truncate py-2.5 pl-3 text-[13.5px] font-bold"
                            style={{ color: "var(--wc-ink)" }}
                          >
                            {r.팀명 ? displayTeamName(r.팀명, shortNames) : "-"}
                          </td>
                          {[r.경기, r.승, r.무, r.패].map((v, k) => (
                            <td
                              key={k}
                              className="gn-num py-2.5 text-right text-[13px]"
                              style={{ color: "var(--wc-mute)" }}
                            >
                              {Number(v) || 0}
                            </td>
                          ))}
                          <td
                            className="gn-num py-2.5 text-right text-[13px]"
                            style={{ color: "var(--wc-mute)" }}
                          >
                            {gd > 0 ? `+${gd}` : gd}
                          </td>
                          <td
                            className="gn-num py-2.5 text-right text-[14px] font-extrabold"
                            style={{ color: "var(--wc-ink)" }}
                          >
                            {Number(r.승점) || 0}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {played > 0 && (
                <p className="mt-3 text-[11.5px]" style={{ color: "var(--wc-mute-2)" }}>
                  <span className="font-bold" style={{ color: "var(--wc-blue)" }}>
                    1–4위
                  </span>{" "}
                  챔피언스리그 ·{" "}
                  <span className="font-bold" style={{ color: "var(--wc-down)" }}>
                    하위 3팀
                  </span>{" "}
                  강등권
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
