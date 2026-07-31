"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth, useClerk } from "@clerk/nextjs"
import { Check, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { getAttribution } from "@/lib/analytics/attribution"

export interface SeasonGroup {
  slug: string
  name: string
  club_kor: string
  color: string
  motto: string
  /** 구단 크레스트 이미지 경로 (없으면 미표시) */
  crest?: string | null
  /** 선수 포스터 일러스트 (그런지 스타일, 특정 인물 아님) — 카드 우측에 배치 */
  player?: string | null
  /** 팀별 등록자 수 — 실시간 공개 항목 (순위·성적은 주 1회만) */
  regCount: number
}

/**
 * 시즌 오픈 대항전 팀 선택 — 3팀 카드, 클릭 즉시 등록.
 * 비로그인은 로그인 모달(가입 후 재클릭 동선), 등록 후 팀 변경 불가.
 * 라이트 존 규칙: 카드 다크 금지 — 팀 컬러는 상단 스트라이프·칩으로만.
 */
export function TeamPicker({
  groups,
  myGroupSlug,
  registrationOpen,
}: {
  groups: SeasonGroup[]
  myGroupSlug: string | null
  registrationOpen: boolean
}) {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [busy, setBusy] = useState<string | null>(null)
  const [joined, setJoined] = useState<string | null>(myGroupSlug)

  async function join(slug: string) {
    if (busy || joined) return
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    if (!registrationOpen) {
      toast({ title: "등록 기간이 아닙니다", description: "이벤트 오픈 후 참가할 수 있어요." })
      return
    }
    if (!confirm("한 번 선택한 팀은 이벤트가 끝날 때까지 변경할 수 없습니다. 진행할까요?")) return
    setBusy(slug)
    try {
      const res = await fetch("/api/event/season/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_slug: slug,
          traffic_source: getAttribution()?.source ?? null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setJoined(slug)
        toast({ title: "이미 참가 완료", description: data.error })
        return
      }
      if (!res.ok) throw new Error(data.error || "등록에 실패했습니다.")
      setJoined(slug)
      toast({
        title: "참가 완료!",
        description: "이제 승부예측으로 팀 성적을 끌어올려 주세요.",
      })
      router.refresh()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "등록 실패",
        description: e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.",
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid w-full gap-3 sm:grid-cols-3">
      {groups.map((g) => {
        const mine = joined === g.slug
        const locked = !!joined && !mine
        return (
          <button
            key={g.slug}
            type="button"
            onClick={() => join(g.slug)}
            disabled={busy !== null || locked}
            aria-pressed={mine}
            className="relative min-h-[210px] rounded-xl text-left transition-transform active:scale-[.99] disabled:cursor-not-allowed"
            style={{
              background: "#fff",
              border: mine ? `2px solid ${g.color}` : "1px solid var(--wc-line)",
              opacity: locked ? 0.45 : 1,
              overflow: "hidden",
              boxShadow: "var(--wc-shadow-1)",
            }}
          >
            {/* 우측 선수 포스터 패널 — 그런지 일러스트(특정 인물 아님)가 흰 카드로
                녹아들게 좌측 엣지를 화이트 그라데이션으로 블렌드 */}
            {g.player && (
              <div aria-hidden className="absolute inset-y-0 right-0 w-[46%] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.player} alt="" className="h-full w-full object-cover" loading="lazy" />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(90deg, #fff 0%, rgba(255,255,255,.55) 14%, rgba(255,255,255,0) 38%)",
                  }}
                />
              </div>
            )}

            <div className="relative z-[1] flex h-full flex-col p-4 pr-[42%]">
              {g.crest && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={g.crest}
                  alt=""
                  className="mb-2 h-11 w-11 object-contain"
                  loading="lazy"
                />
              )}
              <span
                className="text-[27px] leading-none"
                style={{
                  fontFamily: "var(--font-display-ko), var(--font-title)",
                  fontWeight: 700,
                  color: g.color,
                  letterSpacing: "-.01em",
                }}
              >
                {g.club_kor}
              </span>
              {/* 공식 캐치프레이즈 원문 (2026-07-31 운영자 확정) */}
              <p
                className="mt-2 text-[12px] font-semibold italic"
                style={{ color: "var(--wc-mute)", wordBreak: "keep-all", lineHeight: 1.5 }}
              >
                {g.motto}
              </p>

              <div
                className="mt-auto flex flex-wrap items-center justify-between gap-1 pt-3 text-[12.5px] font-bold"
                style={{ color: "var(--wc-mute-2)" }}
              >
                {/* 0 카운트 비노출 규칙 (워룸) — 참가자가 생기기 전엔 모집 문구로 */}
                <span className="tnum" style={{ wordBreak: "keep-all" }}>
                  {g.regCount > 0
                    ? `${g.regCount.toLocaleString()}명 참가 중`
                    : "선착순 아님, 자존심순"}
                </span>
                {busy === g.slug ? (
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: g.color }} />
                ) : mine ? (
                  <span className="inline-flex items-center gap-1" style={{ color: g.color }}>
                    <Check className="h-3.5 w-3.5" strokeWidth={3} /> 내 팀
                  </span>
                ) : joined ? null : (
                  <span style={{ color: "var(--wc-burgundy)", wordBreak: "keep-all" }}>
                    {registrationOpen ? "이 팀으로 참가 →" : "오픈 예정"}
                  </span>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
