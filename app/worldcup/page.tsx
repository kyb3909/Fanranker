import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { Card } from "@/components/ui/card"
import { Trophy, Users, BarChart3, Gamepad2 } from "lucide-react"
import { Countdown } from "@/components/worldcup/countdown"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "월드컵 승부예측 구너 대결",
  description: "월드컵 32강 전까지 사전 등록. 토너먼트 기간 획득 점수 1위 구너에게 상품 증정.",
  alternates: { canonical: "/worldcup" },
  openGraph: {
    title: "월드컵 승부예측 구너 대결 | gongnori.fan",
    description: "아스날 구너 전용. 월드컵 토너먼트 획득 점수 1위에 도전하세요.",
    url: "/worldcup",
  },
}

// 등록자 카운트 즉시 반영
export const dynamic = "force-dynamic"

// 아스날(Gooner) 전용 이벤트 — Kop/Blues 제거 (아스날 유튜버 콜라보 연계).
const GROUPS = [
  {
    slug: "gooner",
    name: "Gooner",
    clubKor: "아스날",
    color: "#EF0107",
    youtuber: "아스날 채널",
    motto: "Victoria Concordia Crescit",
  },
] as const

const STEPS = [
  { num: "01", title: "사전 등록", body: "월드컵 32강 전까지 구너로 사전 등록합니다." },
  {
    num: "02",
    title: "월드컵 기간 베팅",
    body: "기존 베팅 시스템 그대로 — 일반 토큰/골드로 월드컵 경기에 예측 슬립 작성.",
  },
  {
    num: "03",
    title: "1위 결정",
    body: "토너먼트 기간 동안 모은 획득 점수로 랭킹 산정. 1위 구너에게 상품 증정.",
  },
] as const

export default async function WorldcupPage() {
  // 등록자 카운트 — Hub 에서 노출 (소셜 증명 + 다른 페이지로 가는 동선)
  const supabase = createServiceRoleClient()
  const { count: totalRegistrations } = await supabase
    .from("event_registrations")
    .select("*", { count: "exact", head: true })

  return (
    <div className="bg-background min-h-screen">
      {/* Z1.1 Hero — burgundy gradient + grid + orbs + countdown + prize ribbon */}
      <section className="px-4 pt-6 pb-2 sm:pt-8">
        <div className="mx-auto max-w-5xl">
          <div className="wc-hero relative overflow-hidden rounded-3xl px-6 py-12 shadow-2xl sm:px-12 sm:py-16 lg:px-16 lg:py-20">
            <div aria-hidden className="wc-hero-grid absolute inset-0" />
            <div aria-hidden className="wc-orb wc-orb-r" />
            <div aria-hidden className="wc-orb wc-orb-w" />
            <div aria-hidden className="wc-orb wc-orb-b" />

            {/* Prize ribbon — Q1+Q3: 🏆 + 상품 증정 */}
            <div className="wc-prize-ribbon">
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden>
                  🏆
                </span>
                <div>
                  <div className="text-base leading-none font-black tracking-tight">상품 증정</div>
                  <div className="mt-1 text-[10px] tracking-[0.12em] opacity-70">구너 1위에게</div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="relative max-w-2xl text-white">
              <div className="wc-eyebrow mb-5">
                <span aria-hidden className="wc-eyebrow-dot" />
                WORLD CUP 2026
              </div>
              <h1 className="mb-4 text-[40px] leading-[1.05] font-black tracking-tight sm:text-[56px]">
                월드컵 승부예측
                <br />
                <span style={{ color: "var(--wc-gold)" }}>구너 대결</span>
              </h1>
              <p className="mb-8 max-w-xl text-[15px] leading-relaxed opacity-85 sm:text-base">
                월드컵 32강 전까지 구너로 사전 등록하고, 토너먼트 기간 동안 예측으로 점수를
                모으세요. 획득 점수 1위 구너에게 상품을 증정합니다.
              </p>

              <Countdown target="2026-06-11T00:00:00+09:00" label="이벤트 시작까지" />

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/worldcup/register" className="wc-btn-on-hero">
                  사전 등록하기
                </Link>
                <Link
                  href="/worldcup/leaderboard"
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-3 text-sm font-semibold text-white transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.25)",
                  }}
                >
                  구너 현황 →
                </Link>
                {totalRegistrations !== null && (
                  <span className="text-xs font-semibold opacity-80">
                    현재 {totalRegistrations.toLocaleString()}명 등록 중
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Z1.2 상품/메커니즘 카드 — Hero ribbon 보완 */}
      <section className="px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="wc-fact-card">
            <div className="wc-fact-row">
              <div className="wc-fact-icon">
                <Trophy className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="wc-fact-h">토너먼트 획득 점수 1위 구너에게 상품 증정</h2>
                <p className="wc-fact-b">
                  월드컵 32강 전까지 사전 등록. 토너먼트 기간 중 획득 점수 1위 구너에게 상품을
                  증정합니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Z1.3 진행 방식 */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <header className="wc-sec-head">
            <div className="wc-sec-eb">HOW IT WORKS</div>
            <h2 className="wc-sec-h2">진행 방식</h2>
          </header>
          <ol className="wc-how-grid">
            {STEPS.map((s) => (
              <li key={s.num} className="wc-how-step">
                <div className="wc-how-num">{s.num}</div>
                <h3 className="wc-how-h">{s.title}</h3>
                <p className="wc-how-b">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Z1.4 구너 정체성 카드 — 아스날 전용 */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <header className="wc-sec-head">
            <div className="wc-sec-eb">FOR GOONERS</div>
            <h2 className="wc-sec-h2">아스날 구너 전용</h2>
            <p className="wc-sec-sub">이 이벤트는 아스날 구너들만의 예측 대결입니다.</p>
          </header>
          <div className="wc-paths">
            {GROUPS.map((g) => (
              <article
                key={g.slug}
                className="wc-path"
                style={{ ["--gp" as string]: g.color } as React.CSSProperties}
              >
                <div className="wc-path-name">{g.name}</div>
                <div className="wc-path-sub">{g.clubKor} 팬덤</div>
                <p className="wc-path-motto">{g.motto}</p>
                <p className="wc-path-foot">유입 · {g.youtuber}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Z1.5 하단 액션 카드 — 등록 / 베팅 / 리더보드 동선 */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <header className="wc-sec-head text-center">
            <div className="wc-sec-eb">EVENT MENU</div>
            <h2 className="wc-sec-h2">지금 할 수 있는 것</h2>
          </header>
          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href="/worldcup/register"
              className="wc-action-card group"
              style={{ ["--gp" as string]: "var(--wc-burgundy)" } as React.CSSProperties}
            >
              <Users className="mb-3 h-6 w-6" style={{ color: "var(--wc-burgundy)" }} />
              <div className="wc-action-card-h">사전 등록</div>
              <p className="wc-action-card-b">
                아스날 구너로 등록하고 월드컵 예측 대결에 참가. 등록 후 변경 불가.
              </p>
              <span className="wc-action-card-cta">등록하기 →</span>
            </Link>
            <Link
              href="/worldcup/games"
              className="wc-action-card group"
              style={{ ["--gp" as string]: "var(--wc-go)" } as React.CSSProperties}
            >
              <Gamepad2 className="mb-3 h-6 w-6" style={{ color: "var(--wc-go)" }} />
              <div className="wc-action-card-h">월드컵 경기 베팅</div>
              <p className="wc-action-card-b">
                보유 토큰·골드로 월드컵 경기 예측. 슬립이 구너 랭킹에 반영.
              </p>
              <span className="wc-action-card-cta">베팅하러 →</span>
            </Link>
            <Link
              href="/worldcup/leaderboard"
              className="wc-action-card group"
              style={{ ["--gp" as string]: "var(--wc-blue)" } as React.CSSProperties}
            >
              <BarChart3 className="mb-3 h-6 w-6" style={{ color: "var(--wc-blue)" }} />
              <div className="wc-action-card-h">구너 현황</div>
              <p className="wc-action-card-b">
                구너 전체 평균 + 내 위치. 개별 순위는 종료 후 결과 발표에서 공개.
              </p>
              <span className="wc-action-card-cta">현황 보기 →</span>
            </Link>
          </div>
          <p className="mt-8 text-center text-[12px]" style={{ color: "var(--wc-mute)" }}>
            등록은 무료. 한 번 등록하면 변경할 수 없습니다.
            {totalRegistrations !== null && ` · 현재 ${totalRegistrations.toLocaleString()}명 등록`}
          </p>
        </div>
      </section>
    </div>
  )
}
