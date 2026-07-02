import type { Metadata } from "next"
import nextDynamic from "next/dynamic"
import Link from "@/components/ui/app-link"
import { ArrowLeft } from "lucide-react"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { SectionHeader } from "@/components/section-header"
import { BoardRecentPosts } from "@/components/board-recent-posts"

// BettingPage 는 client component (use client). dynamic import 로 lazy.
const BettingPage = nextDynamic(() => import("@/components/betting/betting-page"))

export const metadata: Metadata = {
  title: "월드컵 경기 예측",
  description: "아스날 구너로 월드컵 경기를 예측하고 최고 점수 1위에 도전하세요.",
  alternates: { canonical: "/worldcup/games" },
}

// 경기 유무·등록자 즉시 반영
export const dynamic = "force-dynamic"

const EVENT_SLUG = "worldcup-2026"

interface EventRow {
  id: string
  status: string
  start_at: string
  league_codes: string[] | null
}

export default async function WorldcupGamesPage() {
  const supabase = createServiceRoleClient()

  const { data: event } = await supabase
    .from("events")
    .select("id, status, start_at, league_codes")
    .eq("slug", EVENT_SLUG)
    .maybeSingle<EventRow>()

  const leagueCodes = event?.league_codes ?? []

  // 킥오프 전인 "이벤트 코드" 예정 경기가 있을 때만 베팅을 연다.
  // 없으면 카운트다운만 — NBA 더미 시기엔 0건이라 카운트다운, 실제 월드컵 경기가
  // 등록되는 순간(코드 매칭) 자동으로 예측 화면이 열린다.
  // 데일리 윈도우(08:00~08:00, 8시 정각 제외)는 이벤트에 적용하지 않음 — KST 새벽
  // 킥오프 중심인 월드컵과 충돌 (games GET 이벤트 모드와 동일 규칙, 2026-07-02).
  let hasGamesToday = false
  if (event && event.status === "live" && leagueCodes.length > 0) {
    const { count } = await supabase
      .from("betman_games")
      .select("id", { count: "exact", head: true })
      .in("league_code", leagueCodes)
      .eq("status", "scheduled")
      .gt("match_time", new Date().toISOString())
    hasGamesToday = (count ?? 0) > 0
  }
  // 이벤트 시작(6.28 오후 1시 — 32강 확정 시점) 전엔 예측을 막는다. 축월드컵 경기가 미리 등록돼도
  // 시작 전 예측은 32강 정식 집계에 안 들어가 "예측은 되는데 점수 안 쌓임" 혼란을 부르므로,
  // 시작 전까지는 아래 "곧 시작" 안내 + 카운트다운만 노출. (랜딩 카운트다운 target 과 동일 상수)
  const WC_START = new Date("2026-06-28T13:00:00+09:00").getTime()
  const bettingOpen = hasGamesToday && Date.now() >= WC_START

  let totalRegistrations = 0
  if (event) {
    const { count } = await supabase
      .from("event_registrations")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event.id)
    totalRegistrations = count ?? 0
  }

  // 예측 페이지 하단에 축구 게시판 최신글 노출 (예측 → 읽기 유도)
  const { data: footballPosts } = await supabase
    .from("posts")
    .select("id, title, comment_count, vote_count, created_at")
    .eq("community_slug", "football")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(8)
  const recentFootball = (footballPosts ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    comment_count: p.comment_count ?? 0,
    vote_count: p.vote_count ?? 0,
    created_at: p.created_at ?? new Date().toISOString(),
    profile: null,
  }))

  return (
    <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
      <div className="mx-auto max-w-[1120px] px-6 pt-10 pb-16">
        <Link
          href="/worldcup"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: "var(--wc-mute)" }}
        >
          <ArrowLeft className="h-4 w-4" /> 이벤트 안내로
        </Link>
        <SectionHeader label="WORLD CUP" title="월드컵 경기 예측" style={{ marginTop: 16 }} />

        {bettingOpen ? (
          <div className="mt-7">
            <BettingPage eventSlug={EVENT_SLUG} leagueCodes={leagueCodes} bettingOnly railMode />
          </div>
        ) : (
          <div
            className="mt-8"
            style={{
              background: "#fff",
              border: "1px solid var(--wc-line)",
              borderRadius: 20,
              boxShadow: "var(--wc-shadow-1)",
              padding: "44px 24px 40px",
              textAlign: "center",
            }}
          >
            <div className="flex justify-center">
              <span className="wc-pill-wine">경기 대기 중</span>
            </div>
            <h2
              className="mt-4 text-[22px] font-extrabold sm:text-[26px]"
              style={{ letterSpacing: "-.02em", color: "var(--wc-ink)" }}
            >
              다음 경기를 기다리는 중이에요
            </h2>
            <p
              className="mx-auto mt-2.5 mb-7 max-w-[440px] text-[14.5px]"
              style={{ lineHeight: 1.65, color: "var(--wc-ink-2)" }}
            >
              아직 등록된 경기 정보가 없어요. 업데이트되는 대로 이곳에 바로 추가됩니다.
            </p>
            {totalRegistrations > 0 && (
              <p className="mt-6 text-[13px] font-semibold" style={{ color: "var(--wc-mute)" }}>
                현재{" "}
                <span style={{ color: "var(--wc-burgundy)" }}>
                  {totalRegistrations.toLocaleString()}명
                </span>{" "}
                신청 완료
              </p>
            )}
          </div>
        )}

        <div className="mt-12">
          <BoardRecentPosts
            posts={recentFootball}
            boardName="축구"
            boardSlug="football"
            currentPostId=""
          />
        </div>
      </div>
    </div>
  )
}
