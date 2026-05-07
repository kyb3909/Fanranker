import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { Card } from "@/components/ui/card"
import { Trophy } from "lucide-react"
import { Countdown } from "@/components/worldcup/countdown"

export const metadata: Metadata = {
  title: "월드컵 승부예측 그룹 대결",
  description:
    "응원하는 클럽 그룹에 가입해 월드컵 기간 예측 대결. 1위 100만원 상품, 그룹 평균 적중률로 축잘알 팬덤 결정.",
  alternates: { canonical: "/worldcup" },
  openGraph: {
    title: "월드컵 승부예측 그룹 대결 | gongnori.fan",
    description: "1위 100만원 상품. 응원 그룹에 가입해 축잘알 1위에 도전하세요.",
    url: "/worldcup",
  },
}

const GROUPS = [
  {
    slug: "gooner",
    name: "Gooner",
    clubKor: "아스날",
    color: "#EF0107",
    youtuber: "아스날 채널",
    motto: "Victoria Concordia Crescit",
  },
  {
    slug: "kop",
    name: "Kopite",
    clubKor: "리버풀",
    color: "#C8102E",
    youtuber: "리버풀 채널",
    motto: "You'll Never Walk Alone",
  },
  {
    slug: "blues",
    name: "Blue",
    clubKor: "첼시",
    color: "#034694",
    youtuber: "첼시 채널",
    motto: "Pride of London",
  },
] as const

const STEPS = [
  { num: "01", title: "사전 등록", body: "월드컵 시작 전 등록하고 응원 그룹 한 곳을 고릅니다." },
  {
    num: "02",
    title: "월드컵 기간 베팅",
    body: "기존 베팅 시스템 그대로 — 일반 토큰/골드로 월드컵 경기에 예측 슬립 작성.",
  },
  {
    num: "03",
    title: "1위 결정",
    body: "그룹 내 적중률·수익률로 랭킹 산정. 그룹 평균으로 축잘알 팬덤도 가립니다.",
  },
] as const

export default function WorldcupPage() {
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
                  <div className="mt-1 text-[10px] tracking-[0.12em] opacity-70">
                    각 그룹 1위에게
                  </div>
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
                <span style={{ color: "var(--wc-gold)" }}>그룹 대결</span>
              </h1>
              <p className="mb-8 max-w-xl text-[15px] leading-relaxed opacity-85 sm:text-base">
                Gooner / Kopite / Blue 세 그룹 중 한 곳에 합류해 월드컵 기간 동안 예측 대결. 그룹
                1위에게 상품 증정, 그룹 평균 적중률로 &quot;축잘알 팬덤&quot;을 가립니다.
              </p>

              <Countdown target="2026-06-11T00:00:00+09:00" label="이벤트 시작까지" />

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/worldcup/register" className="wc-btn-on-hero">
                  사전 등록하기
                </Link>
                <span className="text-xs opacity-70">월드컵 시작 전까지 등록 가능</span>
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
                <h2 className="wc-fact-h">상품 증정 + 축잘알 팬덤 선정</h2>
                <p className="wc-fact-b">
                  각 그룹 1위에게 상품 증정. 그룹 평균 적중률·수익률 1위 그룹은 &quot;이번 시즌의
                  축잘알 팬덤&quot;으로 선정됩니다.
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

      {/* Z1.4 그룹 카드 — 영문 호칭 + motto */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <header className="wc-sec-head">
            <div className="wc-sec-eb">CHOOSE YOUR PATH</div>
            <h2 className="wc-sec-h2">참여 그룹</h2>
            <p className="wc-sec-sub">한 그룹에만 가입할 수 있습니다. 등록 후 변경 불가.</p>
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

      {/* Z1.5 하단 CTA */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl text-center">
          <Link href="/worldcup/register" className="wc-btn-primary-big">
            지금 사전 등록하기
          </Link>
          <p className="mt-4 text-[12px]" style={{ color: "var(--wc-mute)" }}>
            등록은 무료. 응원 그룹은 한 번만 선택할 수 있습니다.
          </p>
        </div>
      </section>
    </div>
  )
}
