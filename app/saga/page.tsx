import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { PageBand } from "@/components/page-band"
import { formatRelativeTime } from "@/lib/utils/date"
import { STAGE_FLOW, STAGE_LABEL, stageIndex, type SagaType } from "@/lib/saga/stages"
import { isReportClub } from "@/lib/soccerway/report-clubs"
import { SagaBrowser, type MatchItem } from "./saga-browser"

export const metadata: Metadata = {
  // "이적 사가" 단독 제목은 상단의 팀 시즌 문서를 가렸다 — "사가"로 승격
  // (2026-08-22 진입로 토의 + 운영자 네이밍 확정: 실록(내부 코드네임)이 아니라 사가)
  title: "사가 — 팀의 시즌과 이적설, 살아있는 문서",
  description:
    "팀의 한 시즌과 이적설 하나하나가 문서가 된다. 경기가 끝나고 소식이 터질 때마다 문서가 자라고, 그 위에서 팬들이 예측하고 싸운다.",
  alternates: { canonical: "/saga" },
}

// 새 엔트리 발행 = 피드 범프 — 짧은 재검증으로 준실시간
export const revalidate = 60

interface SagaRow {
  id: string
  saga_type: SagaType
  slug: string
  title: string
  stage: string
  status: string
  outcome: string | null
  is_confirmed: boolean
  summary: string | null
  entry_count: number
  last_event_at: string
  subject: Record<string, unknown>
}

/** 최근 끝난 경기 + 그 경기 리포트 (2026-08-25 운영자: "경기가 가장 중요") */
const MATCH_WINDOW_DAYS = 14

async function recentMatches(
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<MatchItem[]> {
  const since = new Date(Date.now() - MATCH_WINDOW_DAYS * 864e5).toISOString()
  const { data: rows } = await supabase
    .from("betman_games")
    .select("id, home_team_name, away_team_name, home_score, away_score, match_time, league_code")
    .eq("sport", "축구")
    .eq("status", "completed")
    .gte("match_time", since)
    .order("match_time", { ascending: false })
    .limit(2000)

  /**
   * ⚠️ betman_games 는 **한 경기가 여러 행**이다 (마켓·전반전). 그대로 그리면 같은 경기가
   *    5번 나온다. 경기 단위 키(킥오프+홈+원정)로 접고, 스코어는 채워진 행에서 가져온다.
   */
  const byKey = new Map<string, MatchItem>()
  for (const g of rows ?? []) {
    const home = String(g.home_team_name ?? "")
    const away = String(g.away_team_name ?? "")
    // 리포트 대상 구단이 뛴 경기만 — 목록과 리포트의 범위를 같게 둔다
    if (!isReportClub(home) && !isReportClub(away)) continue

    const key = `${g.match_time}|${home}|${away}`
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, {
        key,
        gameId: String(g.id),
        home,
        away,
        homeScore: typeof g.home_score === "number" ? g.home_score : null,
        awayScore: typeof g.away_score === "number" ? g.away_score : null,
        matchTime: String(g.match_time),
        league: g.league_code ? String(g.league_code) : null,
        report: null,
      })
    } else if (prev.homeScore == null && typeof g.home_score === "number") {
      prev.homeScore = g.home_score
      prev.awayScore = typeof g.away_score === "number" ? g.away_score : null
    }
  }

  const matches = [...byKey.values()]
  if (matches.length === 0) return matches

  // 리포트는 그 경기의 **어느 행 id** 로든 붙어 있을 수 있다 → 전부 조회해 키로 되돌린다
  const idsByKey = new Map<string, string[]>()
  for (const g of rows ?? []) {
    const key = `${g.match_time}|${g.home_team_name}|${g.away_team_name}`
    if (!byKey.has(key)) continue
    idsByKey.set(key, [...(idsByKey.get(key) ?? []), String(g.id)])
  }
  const allIds = [...idsByKey.values()].flat()
  const { data: reps } = await supabase
    .from("match_reports")
    .select("game_id, title, paragraphs")
    .in("game_id", allIds)
  const repById = new Map((reps ?? []).map((r) => [String(r.game_id), r]))
  for (const m of matches) {
    for (const id of idsByKey.get(m.key) ?? []) {
      const hit = repById.get(id)
      if (hit?.title) {
        m.report = { title: String(hit.title), paragraphs: (hit.paragraphs as string[]) ?? [] }
        m.gameId = id // 리포트가 붙은 행으로 매치센터 링크를 건다
        break
      }
    }
  }
  return matches
}

/**
 * 사가 인덱스 — 게시판을 "글 목록"이 아니라 "사가 인덱스"로 (PRD §1).
 * 정렬 = last_event_at desc: 이벤트가 터진 사가가 위로 올라온다(범프).
 */
export default async function SagaIndexPage() {
  const supabase = createServiceRoleClient()
  const COLUMNS =
    "id, saga_type, slug, title, stage, status, outcome, is_confirmed, summary, entry_count, last_event_at, subject"
  // 시즌 위키는 별도 쿼리 — 상단 고정 스트립이라던 주석과 달리 실제로는 이적 사가와
  // limit(50) 창을 공유해 88~100위로 밀려 프로덕션에서 한 번도 노출된 적이 없었다
  // (2026-08-12 QA ISSUE-001). 시즌 문서는 몇 개 안 되므로 전용 쿼리가 정답.
  const [{ data: seasonData }, { data: transferData }] = await Promise.all([
    supabase
      .from("sagas")
      .select(COLUMNS)
      .eq("saga_type", "season")
      .order("last_event_at", { ascending: false })
      .limit(8),
    supabase
      .from("sagas")
      .select(COLUMNS)
      .neq("saga_type", "season")
      .order("last_event_at", { ascending: false })
      .limit(50),
  ])
  const seasons = (seasonData ?? []) as unknown as SagaRow[]
  const sagas = (transferData ?? []) as unknown as SagaRow[]

  const matches = await recentMatches(supabase)

  return (
    <div className="worldcup-scope min-h-[100dvh]" style={{ background: "var(--wc-paper)" }}>
      <PageBand
        kicker="Saga"
        title="사가"
        description="팀의 한 시즌, 이적설 하나하나가 문서가 됩니다 — 경기가 끝나고 소식이 터질 때마다 자랍니다. 어디까지 왔는지 보고, 결말을 예측해보세요."
      />

      <main className="mx-auto max-w-[860px] px-4 pt-6 pb-16 sm:px-6">
        {/* 팀 시즌 위키 스트립 — 이벤트 유입(Kop/Blues)의 팀 허브 착지 */}
        {seasons.length > 0 && (
          <div className="mb-5">
            <p
              className="mb-2 text-[12px] font-extrabold tracking-wide"
              style={{ color: "var(--wc-mute)" }}
            >
              시즌 사가
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {seasons.map((s) => (
                <Link
                  key={s.id}
                  href={`/saga/${s.slug}`}
                  className="rounded-xl px-4 py-3 transition-shadow hover:shadow-md"
                  style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
                >
                  <p className="text-[12px] font-extrabold" style={{ color: "var(--wc-burgundy)" }}>
                    SEASON SAGA
                  </p>
                  <p
                    className="mt-0.5 text-[16px] font-extrabold"
                    style={{ color: "var(--wc-ink)" }}
                  >
                    {s.title}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        <SagaBrowser
          matches={matches}
          transfers={
            sagas.length === 0 ? (
              <p className="py-16 text-center text-[14px]" style={{ color: "var(--wc-mute)" }}>
                아직 열린 사가가 없습니다 — 이적시장이 움직이면 여기부터 채워집니다.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {sagas.map((s) => {
                  const flow = STAGE_FLOW[s.saga_type]
                  const idx = stageIndex(s.saga_type, s.stage)
                  const closed = s.status === "closed"
                  return (
                    <Link
                      key={s.id}
                      href={`/saga/${s.slug}`}
                      className="block rounded-xl px-5 py-4 transition-shadow hover:shadow-md"
                      style={{
                        background: "var(--wc-card, #fff)",
                        boxShadow: "var(--wc-shadow-1)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {/* 단계 칩 — "지금 어디까지 왔나"가 재방문 이유 (PRD §7) */}
                        <span
                          className="rounded px-1.5 py-0.5 text-[12px] font-extrabold"
                          style={{
                            background: closed ? "var(--wc-line)" : "rgba(150,30,55,.08)",
                            color: closed ? "var(--wc-mute)" : "var(--wc-burgundy)",
                          }}
                        >
                          {closed
                            ? (STAGE_LABEL[s.outcome ?? ""] ?? "종결")
                            : (STAGE_LABEL[s.stage] ?? s.stage)}
                        </span>
                        {!s.is_confirmed && !closed && (
                          <span
                            className="text-[12px] font-bold"
                            style={{ color: "var(--wc-mute)" }}
                          >
                            미확인 루머
                          </span>
                        )}
                        <span
                          className="ml-auto text-[12px]"
                          style={{ color: "var(--wc-mute)" }}
                          suppressHydrationWarning
                        >
                          {formatRelativeTime(new Date(s.last_event_at))}
                        </span>
                      </div>

                      <h2
                        className="mt-1.5 text-[16px] font-extrabold"
                        style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                      >
                        {s.title}
                      </h2>
                      {s.summary && (
                        <p
                          className="mt-1 line-clamp-2 text-[13px]"
                          style={{ color: "var(--wc-mute)", wordBreak: "keep-all" }}
                        >
                          {s.summary}
                        </p>
                      )}

                      {/* 진행도 바 — stage 스테퍼 요약 */}
                      <div className="mt-3 flex items-center gap-1" aria-hidden>
                        {flow.slice(0, -1).map((st, i) => (
                          <span
                            key={st}
                            className="h-1 flex-1 rounded-full"
                            style={{
                              background:
                                i <= idx && !closed
                                  ? "var(--wc-burgundy)"
                                  : closed && s.outcome === "done"
                                    ? "var(--wc-burgundy)"
                                    : "var(--wc-line)",
                            }}
                          />
                        ))}
                        <span
                          className="ml-2 text-[12px] font-bold"
                          style={{ color: "var(--wc-mute)" }}
                        >
                          기록 {s.entry_count}건
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )
          }
        />
      </main>
    </div>
  )
}
