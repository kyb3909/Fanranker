import type { Metadata } from "next"
import nextDynamic from "next/dynamic"
import Link from "@/components/ui/app-link"
import { ArrowLeft } from "lucide-react"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { Countdown } from "@/components/worldcup/countdown"
import { getDailyWindow } from "@/lib/betman/daily-round"
import { SectionHeader } from "@/components/section-header"

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

  // 오늘 베팅 윈도우에 "이벤트 코드"의 예정 경기가 있을 때만 베팅을 연다.
  // 없으면 카운트다운만 — NBA 더미 시기엔 0건이라 카운트다운, 실제 월드컵 경기가
  // 등록되는 순간(코드 매칭) 자동으로 예측 화면이 열린다.
  let hasGamesToday = false
  if (event && event.status === "live" && leagueCodes.length > 0) {
    const { start, end } = getDailyWindow()
    const { count } = await supabase
      .from("betman_games")
      .select("id", { count: "exact", head: true })
      .in("league_code", leagueCodes)
      .eq("status", "scheduled")
      .gt("match_time", start.toISOString()) // 8시 정각 제외 — 메인 games GET 과 동일 규칙
      .lt("match_time", end.toISOString())
    hasGamesToday = (count ?? 0) > 0
  }
  // 이벤트 시작(6.29 새벽 4시) 전엔 예측을 막는다. 축월드컵 경기가 미리 등록돼도
  // 시작 전 예측은 32강 정식 집계에 안 들어가 "예측은 되는데 점수 안 쌓임" 혼란을 부르므로,
  // 시작 전까지는 아래 "곧 시작" 안내 + 카운트다운만 노출. (랜딩 카운트다운 target 과 동일 상수)
  const WC_START = new Date("2026-06-29T04:00:00+09:00").getTime()
  const bettingOpen = hasGamesToday && Date.now() >= WC_START

  let totalRegistrations = 0
  if (event) {
    const { count } = await supabase
      .from("event_registrations")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event.id)
    totalRegistrations = count ?? 0
  }

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
              곧 월드컵 경기가 시작됩니다
            </h2>
            <p
              className="mx-auto mt-2.5 mb-7 max-w-[440px] text-[14.5px]"
              style={{ lineHeight: 1.65, color: "var(--wc-ink-2)" }}
            >
              월드컵 경기가 열리면 이곳에 일정과 승부예측이 바로 나타납니다. 미리 신청해 두면 준비
              끝!
            </p>
            <div
              className="wc-cd-light"
              style={{ maxWidth: 360, margin: "0 auto", textAlign: "left" }}
            >
              <Countdown
                target={event?.start_at ?? "2026-06-10T14:00:00+09:00"}
                label="월드컵 시작까지"
              />
            </div>
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
      </div>
    </div>
  )
}
