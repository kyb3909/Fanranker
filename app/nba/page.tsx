import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { PageBand } from "@/components/page-band"
import { createServerAnonClient } from "@/lib/supabase"
import { formatRelativeTime } from "@/lib/utils/date"

// ISR 5분 — 홈과 같은 주기. 오프시즌엔 사실상 정적, 시즌 중엔 경기 목록이 갱신된다.
export const revalidate = 300

export const metadata: Metadata = {
  title: "NBA 라운지",
  description: "NBA 경기 일정과 승부예측, 농구 게시판, 그리고 루나의 카드 한 장까지 — NBA 팬의 홈.",
  alternates: { canonical: "/nba" },
}

/**
 * /nba — NBA 중심 허브 (2026-08-13 운영자 요청).
 *
 * 사이트가 축구(EPL) 중심으로 짜여 있어 농구 팬이 앉을 자리가 없었다.
 * 홈을 통째로 복제하는 대신 **재료가 실제로 있는 것만** 조립한다:
 *   · 경기/예측 — betman 농구 (오프시즌엔 빈 상태를 정직하게 보여주고, 개막하면 자동으로 찬다)
 *   · 게시판 — categories.basketball 활성화로 부활한 /community/basketball
 *   · 타로 — 전 종목 대응이라 NBA 질문도 이미 받는다
 * NBA 뉴스는 파이프라인(r/nba 소스)이 없어 약속하지 않는다 — 생기면 그때 섹션 추가.
 */

interface NbaGame {
  home: string
  away: string
  matchTime: string
  league: string | null
}

async function fetchNbaData() {
  const supabase = createServerAnonClient()
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 14 * 86400_000)

  const [gamesResult, postsResult] = await Promise.all([
    supabase
      .from("betman_games")
      .select("home_team_name, away_team_name, match_time, league_code")
      .eq("sport", "농구")
      .eq("status", "scheduled")
      .neq("home_team_name", "미정")
      .neq("away_team_name", "미정")
      .gt("match_time", now.toISOString())
      .lte("match_time", windowEnd.toISOString())
      .order("match_time", { ascending: true })
      .limit(60),
    supabase
      .from("posts")
      .select("id, title, comment_count, vote_count, created_at")
      .eq("community_slug", "basketball")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(8),
  ])

  // 같은 경기가 마켓(일반/핸디캡/언더오버)마다 별도 row — 매치 단위로 접는다
  const seen = new Set<string>()
  const games: NbaGame[] = []
  for (const g of gamesResult.data ?? []) {
    const key = `${g.home_team_name}_${g.away_team_name}_${g.match_time}`
    if (seen.has(key)) continue
    seen.add(key)
    games.push({
      home: g.home_team_name,
      away: g.away_team_name,
      matchTime: g.match_time,
      league: g.league_code,
    })
    if (games.length >= 6) break
  }

  return { games, posts: postsResult.data ?? [] }
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

const sectionTitleStyle = { color: "var(--wc-ink)" } as const
const cardStyle = {
  background: "var(--wc-card)",
  border: "1px solid var(--wc-line)",
  boxShadow: "var(--wc-shadow-1)",
} as const

export default async function NbaPage() {
  const { games, posts } = await fetchNbaData()

  return (
    <div className="worldcup-scope wc-board-canvas min-h-[100dvh]">
      <PageBand
        kicker="NBA"
        title="NBA 라운지"
        description="경기 예측, 농구 게시판, 카드 한 장까지 — NBA 팬의 홈"
      />
      <main
        id="main-content"
        className="container mx-auto max-w-[1280px] px-4 py-6 sm:px-6"
        tabIndex={-1}
      >
        <div className="grid grid-cols-12 gap-4 lg:gap-5">
          <div className="col-span-12 space-y-4 lg:col-span-8">
            {/* 경기 / 승부예측 */}
            <section className="rounded-xl p-4" style={cardStyle}>
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-extrabold" style={sectionTitleStyle}>
                  🏀 다가오는 경기
                </h2>
                {games.length > 0 && (
                  <Link
                    href="/prediction"
                    className="text-[12px] font-bold"
                    style={{ color: "var(--wc-burgundy)" }}
                  >
                    승부예측 가기 →
                  </Link>
                )}
              </div>
              {games.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {games.map((g) => (
                    <li
                      key={`${g.home}_${g.away}_${g.matchTime}`}
                      className="rounded-lg px-3 py-2.5"
                      style={{ background: "var(--wc-soft)" }}
                    >
                      <p className="text-[13px] font-bold" style={{ color: "var(--wc-ink)" }}>
                        {g.home} <span style={{ color: "var(--wc-mute)" }}>vs</span> {g.away}
                      </p>
                      <p className="mt-0.5 text-[12px]" style={{ color: "var(--wc-mute)" }}>
                        {formatKickoff(g.matchTime)}
                        {g.league ? ` · ${g.league}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div
                  className="mt-3 rounded-lg px-4 py-6 text-center"
                  style={{ background: "var(--wc-soft)" }}
                >
                  <p className="text-[14px] font-bold" style={{ color: "var(--wc-ink)" }}>
                    지금은 NBA 오프시즌이에요
                  </p>
                  <p
                    className="mt-1 text-[12px] leading-relaxed"
                    style={{ color: "var(--wc-mute)" }}
                  >
                    시즌이 개막하면 이 자리에 경기 일정과 승부예측이 자동으로 열립니다.
                    <br />
                    그동안은 게시판에서 트레이드·FA 떡밥으로 몸을 풀어요.
                  </p>
                </div>
              )}
            </section>

            {/* 농구 게시판 */}
            <section className="rounded-xl p-4" style={cardStyle}>
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-extrabold" style={sectionTitleStyle}>
                  농구 게시판
                </h2>
                <Link
                  href="/community/basketball"
                  className="text-[12px] font-bold"
                  style={{ color: "var(--wc-burgundy)" }}
                >
                  전체 보기 →
                </Link>
              </div>
              {posts.length > 0 ? (
                <ul className="mt-3 divide-y" style={{ borderColor: "var(--wc-line)" }}>
                  {posts.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/post/${p.id}`}
                        className="flex items-baseline justify-between gap-3 py-2.5"
                      >
                        <span
                          className="min-w-0 truncate text-[13px] font-semibold"
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
                        <span className="shrink-0 text-[12px]" style={{ color: "var(--wc-mute)" }}>
                          {formatRelativeTime(new Date(p.created_at))}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div
                  className="mt-3 rounded-lg px-4 py-6 text-center"
                  style={{ background: "var(--wc-soft)" }}
                >
                  <p className="text-[14px] font-bold" style={{ color: "var(--wc-ink)" }}>
                    아직 글이 없어요
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--wc-mute)" }}>
                    첫 글의 주인공이 되어보세요 — 트레이드 루머, 우리 팀 전망, 어젯밤 하이라이트
                    뭐든 좋아요.
                  </p>
                  <Link
                    href="/write"
                    className="mt-3 inline-block rounded-lg px-4 py-2 text-[13px] font-bold"
                    style={{ background: "var(--wc-burgundy)", color: "#fff" }}
                  >
                    글쓰기
                  </Link>
                </div>
              )}
            </section>
          </div>

          <aside className="col-span-12 space-y-4 lg:col-span-4">
            {/* 루나 타로 — 전 종목 대응이라 NBA 질문도 이미 받는다 */}
            <section className="rounded-xl p-4" style={cardStyle}>
              <h2 className="text-[16px] font-extrabold" style={sectionTitleStyle}>
                🔮 루나의 점집
              </h2>
              <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--wc-mute)" }}>
                NBA 질문도 받아요. 팀 이름을 넣어 물어보면 카드가 흐름을 비춰줍니다.
              </p>
              <Link
                href={`/tarot?q=${encodeURIComponent("올 시즌 NBA 우승, 어느 팀 기운이 좋을까요?")}`}
                className="mt-3 inline-block w-full rounded-lg py-2.5 text-center text-[13px] font-bold"
                style={{ background: "var(--wc-burgundy)", color: "#fff" }}
              >
                카드 한 장 뽑기
              </Link>
            </section>

            {/* 승부예측 안내 — 오프시즌에도 예측 화면 자체는 존재함을 알린다 */}
            <section className="rounded-xl p-4" style={cardStyle}>
              <h2 className="text-[16px] font-extrabold" style={sectionTitleStyle}>
                승부예측
              </h2>
              <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--wc-mute)" }}>
                무료 볼로 즐기는 승부예측. NBA 개막 후에는 농구 탭에서 매일 밤 경기를 픽할 수
                있어요.
              </p>
              <Link
                href="/prediction"
                className="mt-3 inline-block w-full rounded-lg py-2.5 text-center text-[13px] font-bold"
                style={{
                  background: "var(--wc-card)",
                  border: "1px solid var(--wc-line)",
                  color: "var(--wc-ink-2)",
                }}
              >
                예측 화면 보기
              </Link>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
