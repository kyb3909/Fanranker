import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { Card } from "@/components/ui/card"
import { Trophy } from "lucide-react"

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
    name: "구너",
    clubKor: "아스날",
    color: "#EF0107",
    youtuber: "아스날 채널",
  },
  {
    slug: "kop",
    name: "콥",
    clubKor: "리버풀",
    color: "#C8102E",
    youtuber: "리버풀 채널",
  },
  {
    slug: "blues",
    name: "블루스",
    clubKor: "첼시",
    color: "#034694",
    youtuber: "첼시 채널",
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
      {/* Hero */}
      <section className="border-border border-b">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:py-20">
          <div className="font-title mb-3 text-[12px] font-bold tracking-[0.1em] text-amber-600 uppercase dark:text-amber-400">
            월드컵 한정 이벤트
          </div>
          <h1 className="font-title text-foreground text-4xl leading-[1.1] font-bold tracking-tight sm:text-6xl">
            월드컵 승부예측
            <br />
            그룹 대결
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-[16px] leading-[1.65] sm:text-[18px]">
            응원하는 클럽 그룹에 가입해 월드컵 기간 동안 예측 대결을 펼치세요. 그룹 1위 한 분께
            100만원 상당의 상품, 그룹 평균 적중률로 &quot;축잘알 팬덤&quot;을 가립니다.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/worldcup/register"
              className="bg-primary text-primary-foreground font-title hover:bg-primary/90 inline-flex h-12 items-center justify-center rounded-lg px-8 text-[15px] font-semibold transition-colors"
            >
              사전 등록하기
            </Link>
            <span className="text-muted-foreground text-[13px]">월드컵 시작 전까지 등록 가능</span>
          </div>
        </div>
      </section>

      {/* 상품 */}
      <section className="border-border border-b">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <Card className="border-amber-200 bg-amber-50/40 p-6 sm:p-8 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                <Trophy className="h-6 w-6 text-amber-700 dark:text-amber-300" />
              </div>
              <div>
                <h2 className="font-title text-2xl font-bold tracking-tight">
                  1위 상품 — 100만원 상당
                </h2>
                <p className="text-muted-foreground mt-2 text-[15px] leading-[1.65]">
                  각 그룹 1위에게. 그룹 평균 적중률·수익률 1위 그룹은 &quot;이번 시즌의 축잘알
                  팬덤&quot;으로 선정됩니다.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* 진행 방식 */}
      <section className="border-border border-b">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <h2 className="font-title text-foreground mb-8 text-3xl font-bold tracking-tight">
            진행 방식
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <Card key={s.num} className="p-6">
                <div className="font-title text-[12px] font-bold tracking-[0.1em] text-amber-600 dark:text-amber-400">
                  STEP {s.num}
                </div>
                <h3 className="font-title text-foreground mt-3 text-lg font-bold">{s.title}</h3>
                <p className="text-muted-foreground mt-2 text-[14px] leading-[1.65]">{s.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 그룹 */}
      <section className="border-border border-b">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <h2 className="font-title text-foreground mb-3 text-3xl font-bold tracking-tight">
            참여 그룹
          </h2>
          <p className="text-muted-foreground mb-8 text-[14px] leading-[1.65]">
            한 그룹에만 가입할 수 있습니다. 등록 후 변경 불가.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {GROUPS.map((g) => (
              <Card key={g.slug} className="relative overflow-hidden p-6">
                <div
                  aria-hidden
                  className="absolute top-0 right-0 left-0 h-1"
                  style={{ background: g.color }}
                />
                <div
                  className="font-title text-3xl font-bold tracking-tight"
                  style={{ color: g.color }}
                >
                  {g.name}
                </div>
                <p className="text-muted-foreground mt-1.5 text-[13px] leading-[1.65]">
                  {g.clubKor} 팬덤
                </p>
                <p className="text-muted-foreground/70 mt-3 text-[11px]">유입 · {g.youtuber}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <Link
            href="/worldcup/register"
            className="bg-primary text-primary-foreground font-title hover:bg-primary/90 inline-flex h-12 items-center justify-center rounded-lg px-10 text-[15px] font-semibold transition-colors"
          >
            지금 사전 등록하기
          </Link>
          <p className="text-muted-foreground mt-4 text-[12px]">
            등록은 무료. 응원 그룹은 한 번만 선택할 수 있습니다.
          </p>
        </div>
      </section>
    </div>
  )
}
