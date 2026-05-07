"use client"

import { useState } from "react"
import { useUser, SignInButton } from "@clerk/nextjs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, Lock } from "lucide-react"

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

export function RegisterClient() {
  const { isSignedIn, user, isLoaded } = useUser()
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (!isLoaded) {
    return <div className="bg-muted h-64 animate-pulse rounded-lg" />
  }

  if (!isSignedIn) {
    return (
      <div className="space-y-6">
        {/* 로그인 안내 배너 */}
        <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <div className="font-title text-foreground text-[14px] font-bold">
                  로그인 후 등록 가능
                </div>
                <p className="text-muted-foreground mt-0.5 text-[12px] leading-[1.65]">
                  gongnori.fan 계정으로 로그인하면 그룹을 선택하고 등록을 마칠 수 있어요.
                </p>
              </div>
            </div>
            <SignInButton mode="modal">
              <Button size="sm" className="font-title shrink-0 font-semibold">
                로그인하기
              </Button>
            </SignInButton>
          </div>
        </Card>

        {/* 그룹 미리보기 (비활성) */}
        <div className="space-y-3 opacity-70">
          {GROUPS.map((g) => (
            <div
              key={g.slug}
              className="border-border relative w-full overflow-hidden rounded-lg border p-5"
            >
              <div
                aria-hidden
                className="absolute top-0 right-0 left-0 h-1"
                style={{ background: g.color }}
              />
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div
                    className="font-title text-3xl font-bold tracking-tight"
                    style={{ color: g.color }}
                  >
                    {g.name}
                  </div>
                  <div className="text-muted-foreground mt-1.5 text-[13px] leading-[1.5]">
                    {g.clubKor} 팬덤
                  </div>
                  <div className="text-muted-foreground/70 mt-2 text-[11px]">
                    유입 채널 · {g.youtuber}
                  </div>
                </div>
                <Lock className="text-muted-foreground/50 h-5 w-5 shrink-0" />
              </div>
            </div>
          ))}
        </div>

        <p className="text-muted-foreground text-center text-[12px]">
          로그인하면 그룹을 선택하고 등록을 진행할 수 있습니다.
        </p>
      </div>
    )
  }

  if (done) {
    const g = GROUPS.find((x) => x.slug === selectedGroup)
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <Check className="h-6 w-6 text-emerald-700 dark:text-emerald-300" />
        </div>
        <h2 className="font-title mt-4 text-2xl font-bold">등록 완료</h2>
        <p className="text-muted-foreground mt-3 text-[14px] leading-[1.65]">
          <span className="font-semibold" style={{ color: g?.color }}>
            {g?.name}
          </span>
          {g?.clubKor && <span className="text-muted-foreground/70"> ({g.clubKor})</span>} 그룹에
          합류했습니다.
          <br />
          월드컵 시작일에 알림을 보내드릴게요.
        </p>
        <p className="font-title mt-4 text-[12px] font-bold tracking-[0.1em] text-amber-700 uppercase dark:text-amber-300">
          변경 불가 · 끝까지 함께
        </p>
      </Card>
    )
  }

  const handleSubmit = async () => {
    if (!selectedGroup || !agreed) return
    setSubmitting(true)
    // TODO: API 호출 (DB 마이그레이션 phase 에서 추가)
    // POST /api/event/worldcup/register { group_slug }
    await new Promise((r) => setTimeout(r, 600))
    setSubmitting(false)
    setDone(true)
  }

  return (
    <div className="space-y-6">
      {/* 참가 규칙 */}
      <Card className="border-amber-200 bg-amber-50/40 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
        <h3 className="font-title text-foreground text-[14px] font-bold tracking-tight">
          참가 규칙
        </h3>
        <ul className="mt-3 space-y-2.5 text-[13px] leading-[1.65]">
          <li className="flex gap-2">
            <span className="shrink-0 font-bold text-amber-700 dark:text-amber-300">⚠</span>
            <span>
              <strong className="text-foreground">
                한 번 선택한 그룹은 절대 변경할 수 없습니다.
              </strong>
              <span className="text-muted-foreground"> 신중하게 골라주세요.</span>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-amber-700/60 dark:text-amber-300/60">·</span>
            <span className="text-muted-foreground">
              일반 베팅 시스템과 동일한 룰. 보유한 토큰·골드로 월드컵 경기에 베팅합니다.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-amber-700/60 dark:text-amber-300/60">·</span>
            <span className="text-muted-foreground">
              월드컵 기간 적중률·수익률로 그룹 내 1위 결정 →{" "}
              <strong className="text-foreground">100만원 상당 상품</strong>.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-amber-700/60 dark:text-amber-300/60">·</span>
            <span className="text-muted-foreground">
              그룹 평균 적중률·수익률로 &quot;이번 시즌의 축잘알 팬덤&quot;을 선정.
            </span>
          </li>
        </ul>
      </Card>

      {/* 그룹 선택 */}
      <div className="space-y-3">
        {GROUPS.map((g) => {
          const isSelected = selectedGroup === g.slug
          return (
            <button
              key={g.slug}
              type="button"
              onClick={() => setSelectedGroup(g.slug)}
              className={`relative w-full overflow-hidden rounded-lg border p-5 text-left transition-all ${
                isSelected
                  ? "border-foreground ring-foreground/10 ring-2"
                  : "border-border hover:border-foreground/40"
              }`}
            >
              <div
                aria-hidden
                className="absolute top-0 right-0 left-0 h-1"
                style={{ background: g.color }}
              />
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div
                    className="font-title text-3xl font-bold tracking-tight"
                    style={{ color: g.color }}
                  >
                    {g.name}
                  </div>
                  <div className="text-muted-foreground mt-1.5 text-[13px] leading-[1.5]">
                    {g.clubKor} 팬덤
                  </div>
                  <div className="text-muted-foreground/70 mt-2 text-[11px]">
                    유입 채널 · {g.youtuber}
                  </div>
                </div>
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isSelected
                      ? "bg-foreground text-background"
                      : "border-border border bg-transparent"
                  }`}
                >
                  {isSelected && <Check className="h-4 w-4" />}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* 동의 */}
      <Card className="p-4">
        <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-[1.65]">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
          />
          <span className="text-muted-foreground">
            한 번 선택한 그룹은 변경할 수 없으며, 1위 결정은 그룹 내 적중률·수익률 기준으로 산정됨에
            동의합니다.
          </span>
        </label>
      </Card>

      {/* CTA */}
      <Button
        size="lg"
        className="font-title h-12 w-full text-[15px] font-semibold"
        disabled={!selectedGroup || !agreed || submitting}
        onClick={handleSubmit}
      >
        {submitting ? "등록 중..." : "등록 완료"}
      </Button>

      <p className="text-muted-foreground/80 text-center text-[11px]">
        로그인 계정 —{" "}
        {user?.username || user?.firstName || user?.emailAddresses[0]?.emailAddress || ""}
      </p>
    </div>
  )
}
