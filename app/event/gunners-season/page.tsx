import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { PageBand } from "@/components/page-band"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { formatRelativeTime } from "@/lib/utils/date"
import { findArsenalNextMatch, GUNNERS_SEASON, isEventLive } from "@/lib/event/gunners-season"
import { NEWS_BOT_USER_ID } from "@/lib/news/publish"
import { RaceStandingPanel } from "./standing-panel"

export const revalidate = 60

export const metadata: Metadata = {
  title: "건너스 레이스 — 아스날 팬의 전 리그 예측 레이스",
  description:
    "아스날 팬들의 시즌 예측 레이스. 우리 경기만이 아니라 전 세계 모든 축구가 포인트가 됩니다. 8/22 개막.",
  alternates: { canonical: "/event/gunners-season" },
}

/**
 * /event/gunners-season — 건너스 레이스 (2026-08-22 ~ 09-30).
 *
 * 설계 1원칙: **예측은 입구, 목적지는 게시물** (언론사 지표 = 기사 조회·체류·재방문).
 * 그래서 이 페이지의 모든 콘텐츠 링크에 ?ref=event 를 태깅하고, 메인 매치 옆에
 * 아스날 소식, 랭킹 아래에 "지금 뜨는 글"을 상시 배치한다 — 막다른 골목 금지.
 * 예측 풀은 기존 /prediction 그대로 (lib/event/gunners-season.ts 주석 참조).
 */

interface FixtureRow {
  home_team_name: string
  away_team_name: string
  match_time: string
  league_code: string | null
}

async function fetchEventData() {
  const supabase = createServiceRoleClient()
  const now = new Date()
  const dayEnd = new Date(now.getTime() + 36 * 3600_000)

  const [arsenal, gamesRes, arsenalNewsRes, hotPostsRes] = await Promise.all([
    findArsenalNextMatch(supabase),
    supabase
      .from("betman_games")
      .select("home_team_name, away_team_name, match_time, league_code")
      .eq("sport", "축구")
      .eq("status", "scheduled")
      .neq("home_team_name", "미정")
      .gt("match_time", now.toISOString())
      .lte("match_time", dayEnd.toISOString())
      .order("match_time", { ascending: true })
      .limit(60),
    // 아스날 최신 소식 2 — 봇 기사 (표기 흔들림: 아스널/아스날)
    supabase
      .from("posts")
      .select("id, title, created_at")
      .eq("user_id", NEWS_BOT_USER_ID)
      .is("deleted_at", null)
      .or("title.ilike.%아스널%,title.ilike.%아스날%")
      .order("created_at", { ascending: false })
      .limit(2),
    // 지금 뜨는 글 — 온도순 (담벼락과 같은 신호)
    supabase
      .from("posts")
      .select("id, title, community_slug, comment_count, temperature, created_at")
      .is("deleted_at", null)
      .order("temperature", { ascending: false, nullsFirst: false })
      .limit(5),
  ])

  // 마켓별 중복 row → 매치 단위로 접기 (betman 공통 패턴)
  const seen = new Set<string>()
  const fixtures: FixtureRow[] = []
  for (const g of gamesRes.data ?? []) {
    const key = `${g.home_team_name}_${g.away_team_name}_${g.match_time}`
    if (seen.has(key)) continue
    seen.add(key)
    fixtures.push(g)
    if (fixtures.length >= 6) break
  }

  return {
    arsenal,
    fixtures,
    arsenalNews: arsenalNewsRes.data ?? [],
    hotPosts: hotPostsRes.data ?? [],
  }
}

function formatKickoff(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))
}

const cardStyle = {
  background: "var(--wc-card)",
  border: "1px solid var(--wc-line)",
  boxShadow: "var(--wc-shadow-1)",
} as const

export default async function GunnersSeasonPage() {
  const { arsenal, fixtures, arsenalNews, hotPosts } = await fetchEventData()
  const live = isEventLive()
  const startLabel = formatKickoff(GUNNERS_SEASON.startAt).replace(/\s\d{2}:\d{2}$/, "")

  return (
    <div className="worldcup-scope wc-board-canvas min-h-[100dvh]">
      <PageBand
        kicker="GUNNERS SEASON"
        title="건너스 레이스"
        description={
          live
            ? "우리 경기는 자부심, 세상 모든 축구는 레이스 — 9/30까지"
            : `${startLabel} 개막 — 우리 경기는 자부심, 세상 모든 축구는 레이스`
        }
      />
      <main
        id="main-content"
        className="container mx-auto max-w-[1280px] px-4 py-6 sm:px-6"
        tabIndex={-1}
      >
        <div className="grid grid-cols-12 gap-4 lg:gap-5">
          <div className="col-span-12 space-y-4 lg:col-span-8">
            {/* 메인 매치 — 아스날 경기는 배점 동일, 강조만 (운영자 확정: 보너스 없음) */}
            <section
              className="rounded-xl p-4"
              style={{
                background: "var(--wc-wine-tint)",
                border: "1px solid var(--wc-line)",
                boxShadow: "var(--wc-shadow-1)",
              }}
            >
              <p className="text-[12px] font-extrabold" style={{ color: "var(--wc-burgundy)" }}>
                ★ 메인 매치
              </p>
              {arsenal ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[17px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                      {arsenal.home} <span style={{ color: "var(--wc-mute)" }}>vs</span>{" "}
                      {arsenal.away}
                    </p>
                    <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--wc-mute)" }}>
                      {formatKickoff(arsenal.matchTime)}
                      {arsenal.league ? ` · ${arsenal.league}` : ""}
                    </p>
                  </div>
                  <Link
                    href="/prediction?ref=event"
                    className="rounded-lg px-4 py-2.5 text-[13.5px] font-bold"
                    style={{ background: "var(--wc-burgundy)", color: "#fff" }}
                  >
                    예측하러 가기 →
                  </Link>
                </div>
              ) : (
                <p className="mt-2 text-[13.5px]" style={{ color: "var(--wc-mute)" }}>
                  다가오는 아스날 경기가 등록되면 여기에 표시됩니다.
                </p>
              )}
              {/* 예측 전에도 읽을거리 먼저 — 콘텐츠 전환 루프의 상시 진입점 */}
              {arsenalNews.length > 0 && (
                <div
                  className="mt-3 space-y-1 border-t pt-2.5"
                  style={{ borderColor: "var(--wc-line)" }}
                >
                  {arsenalNews.map((n) => (
                    <Link
                      key={n.id}
                      href={`/post/${n.id}?ref=event`}
                      className="block truncate text-[13px] font-semibold hover:underline"
                      style={{ color: "var(--wc-ink-2)" }}
                    >
                      📰 {n.title}
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* 오늘의 전 리그 경기 — 전부 레이스 대상 */}
            <section className="rounded-xl p-4" style={cardStyle}>
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                  ⚽ 오늘의 전 리그 경기
                </h2>
                <Link
                  href="/prediction?ref=event"
                  className="text-[12.5px] font-bold"
                  style={{ color: "var(--wc-burgundy)" }}
                >
                  전체 경기 예측 →
                </Link>
              </div>
              {fixtures.length > 0 ? (
                <ul className="mt-3 divide-y" style={{ borderColor: "var(--wc-line)" }}>
                  {fixtures.map((g) => (
                    <li
                      key={`${g.home_team_name}_${g.match_time}`}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p
                          className="truncate text-[13.5px] font-bold"
                          style={{ color: "var(--wc-ink)" }}
                        >
                          {g.home_team_name} <span style={{ color: "var(--wc-mute)" }}>vs</span>{" "}
                          {g.away_team_name}
                        </p>
                        <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
                          {formatKickoff(g.match_time)}
                          {g.league_code ? ` · ${g.league_code}` : ""}
                        </p>
                      </div>
                      <Link
                        href="/prediction?ref=event"
                        className="shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-bold"
                        style={{
                          background: "var(--wc-card)",
                          border: "1px solid var(--wc-line-2)",
                          color: "var(--wc-burgundy)",
                        }}
                      >
                        예측
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13px]" style={{ color: "var(--wc-mute)" }}>
                  오늘 예정된 축구 경기가 아직 없어요 — 내일 슬레이트를 기다려주세요.
                </p>
              )}
            </section>

            {/* 지금 뜨는 글 — 이벤트 페이지가 막다른 골목이 되지 않게 (핵심 전환 루프) */}
            <section className="rounded-xl p-4" style={cardStyle}>
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                  🔥 지금 뜨는 글
                </h2>
                <Link
                  href="/?ref=event"
                  className="text-[12.5px] font-bold"
                  style={{ color: "var(--wc-burgundy)" }}
                >
                  담벼락 가기 →
                </Link>
              </div>
              <ul className="mt-3 divide-y" style={{ borderColor: "var(--wc-line)" }}>
                {hotPosts.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/post/${p.id}?ref=event`}
                      className="flex items-baseline justify-between gap-3 py-2.5"
                    >
                      <span
                        className="min-w-0 truncate text-[13.5px] font-semibold"
                        style={{ color: "var(--wc-ink)" }}
                      >
                        {p.title}
                        {(p.comment_count ?? 0) > 0 && (
                          <span
                            className="ml-1.5 text-[12px] font-bold"
                            style={{ color: "var(--wc-burgundy)" }}
                          >
                            {p.comment_count}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
                        {formatRelativeTime(new Date(p.created_at))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="col-span-12 space-y-4 lg:col-span-4">
            {/* 내 레이스 현황 + 구너 랭킹 TOP 5 (클라이언트 — 개인화) */}
            <RaceStandingPanel />
          </aside>
        </div>
      </main>
    </div>
  )
}
