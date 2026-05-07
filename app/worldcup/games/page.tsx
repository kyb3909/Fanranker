import type { Metadata } from "next"
import dynamic from "next/dynamic"
import Link from "@/components/ui/app-link"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { Countdown } from "@/components/worldcup/countdown"
import { Lock, Users, ArrowRight } from "lucide-react"

// BettingPage 는 client component (use client). dynamic import 로 lazy.
const BettingPage = dynamic(() => import("@/components/betting/betting-page"))

export const metadata: Metadata = {
  title: "월드컵 경기 베팅",
  description: "월드컵 기간 동안 등록한 그룹 안에서 적중률·수익률로 1위에 도전하세요.",
  alternates: { canonical: "/worldcup/games" },
}

const EVENT_SLUG = "worldcup-2026"

interface EventRow {
  id: string
  status: string
  start_at: string
  registration_closes_at: string
  league_codes: string[] | null
}

export default async function WorldcupGamesPage() {
  const supabase = createServiceRoleClient()

  const { data: event } = await supabase
    .from("events")
    .select("id, status, start_at, registration_closes_at, league_codes")
    .eq("slug", EVENT_SLUG)
    .maybeSingle<EventRow>()

  // 등록자 카운트
  let totalRegistrations = 0
  if (event) {
    const { count } = await supabase
      .from("event_registrations")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event.id)
    totalRegistrations = count ?? 0
  }

  const leagueCodes = event?.league_codes ?? []
  const codesAssigned = leagueCodes.length > 0
  const eventLive = event?.status === "live"

  return (
    <div className="px-4 pt-6 pb-16 sm:pt-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <Link href="/worldcup" className="wc-reg-head-back">
            ← 이벤트 안내로
          </Link>
          <div className="wc-sec-eb">WORLD CUP GAMES</div>
          <h1
            className="font-black tracking-tight"
            style={{
              fontSize: "clamp(28px, 4.5vw, 36px)",
              lineHeight: 1.15,
              color: "var(--wc-ink)",
              letterSpacing: "-0.02em",
            }}
          >
            월드컵 경기 베팅
          </h1>
        </header>

        {!event ? (
          <div className="wc-reg-rules">
            <div className="wc-reg-rules-h">
              <span aria-hidden>!</span>
              이벤트 미존재
            </div>
            <p className="text-[13px] leading-[1.6]">
              월드컵 이벤트(slug=&quot;{EVENT_SLUG}&quot;)를 찾을 수 없습니다. 마이그레이션 적용 후
              다시 시도해주세요.
            </p>
          </div>
        ) : !eventLive || !codesAssigned ? (
          <div className="space-y-6">
            {/* 안내 카드 — 코드 미배정 또는 시작 전 */}
            <div className="wc-reg-rules">
              <div className="wc-reg-rules-h">
                <Lock className="h-4 w-4" aria-hidden />
                {!eventLive ? "이벤트 시작 대기 중" : "월드컵 경기 코드 배정 대기 중"}
              </div>
              <ul className="wc-reg-rules-list">
                <li>
                  <span>
                    <strong>월드컵 경기 베팅</strong>은 이벤트 시작 + betman 의 월드컵 경기 코드
                    배정이 모두 완료된 후 활성화됩니다.
                  </span>
                </li>
                <li>
                  <span>
                    그동안{" "}
                    <Link href="/prediction" className="underline">
                      일반 승부예측
                    </Link>
                    에서 다른 경기 베팅을 즐기세요. 그 슬립은 월드컵 랭킹에 반영되지 않습니다.
                  </span>
                </li>
                <li>
                  <span>
                    이벤트 시작 즈음 푸시 알림을 보내드릴게요. 등록만 해두면 자동으로 받습니다.
                  </span>
                </li>
              </ul>
            </div>

            {/* 카운트다운 */}
            <div className="wc-done-cd-wrap">
              <Countdown target={event.start_at} label="이벤트 시작까지" />
            </div>

            {/* 등록자 카운트 */}
            <div
              className="flex items-center justify-between rounded-xl border p-5"
              style={{
                background: "var(--wc-card)",
                borderColor: "var(--wc-line)",
                boxShadow: "var(--wc-shadow-1)",
              }}
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5" style={{ color: "var(--wc-burgundy)" }} />
                <div>
                  <div
                    className="text-[12px] font-semibold tracking-[0.08em] uppercase"
                    style={{ color: "var(--wc-mute)" }}
                  >
                    현재 등록자
                  </div>
                  <div
                    className="text-2xl font-black tabular-nums"
                    style={{ color: "var(--wc-ink)" }}
                  >
                    {totalRegistrations.toLocaleString()}명
                  </div>
                </div>
              </div>
              <Link
                href="/worldcup/register"
                className="inline-flex items-center gap-1.5 text-sm font-semibold"
                style={{ color: "var(--wc-burgundy)" }}
              >
                등록하기 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="text-center text-[12px]" style={{ color: "var(--wc-mute)" }}>
              {codesAssigned ? (
                <>월드컵 경기 코드 {leagueCodes.length}개 배정됨 — 이벤트 시작 시 활성화</>
              ) : (
                <>betman 월드컵 코드 배정 후 운영자가 이 페이지를 활성화합니다.</>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className="rounded-lg border p-3 text-[12px]"
              style={{
                background: "rgba(47, 125, 91, 0.06)",
                borderColor: "var(--wc-go)",
                color: "var(--wc-go)",
              }}
            >
              ✓ 월드컵 베팅 활성화됨 · 대상 코드: {leagueCodes.join(", ")} · 등록자만 베팅 가능
            </div>
            <BettingPage eventSlug={EVENT_SLUG} leagueCodes={leagueCodes} bettingOnly />
          </div>
        )}
      </div>
    </div>
  )
}
