"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth, useClerk } from "@clerk/nextjs"
import { ArrowRight, Check, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { getAttribution } from "@/lib/analytics/attribution"

export interface CogSide {
  /** event_groups.slug — blues | kop */
  slug: string
  /** 구단명 (첼시 / 리버풀) */
  club_kor: string
  /** 팬덤명 (Blues / Kop) */
  name: string
  /** 팀 컬러 — 상단 스트라이프와 구단명에만 쓴다 (카드 자체는 흰색) */
  color: string
  /** 공식 캐치프레이즈 원문 */
  motto: string
  /** 소속 코그 크리에이터 (첼루키 / 리빅) */
  creator: string
  /** 진영 참가자 수 — 0 이면 비노출 */
  regCount: number
}

/**
 * 코그 시청자 팬덤 대결 — 2진영 선택.
 *
 * components/season/team-picker.tsx(3파전 시절 자산, 현재 미사용)의 디자인 문법을 따르되
 * 두 가지가 다르다:
 *  ① 카드 클릭 = 즉시 등록이 아니라 **선택**이고, 아래 참가 버튼이 확정한다.
 *     진영을 되돌릴 수 없는 대결이라 "잘못 눌렀다"가 곧 사고다.
 *  ② 실제 클럽 엠블럼을 쓰지 않는다 — 색과 이름만 (제휴 전 자산 사용 금지).
 *
 * 라이트 존 규칙: 카드 다크 금지, 한쪽 액센트 보더 금지.
 * 팀 컬러는 상단 스트라이프·구단명 텍스트로만 들어간다.
 *
 * ⚠️ traffic_source: getAttribution() — 최초터치 UTM → 참가 귀속의 유일한 발사 지점.
 *    race-join-button.tsx 에서 이식. 누락하면 첼루키/리빅 어느 채널이 데려왔는지가
 *    소급 불가로 증발한다.
 */
export function CogSidePicker({
  sides,
  registrationOpen,
}: {
  sides: CogSide[]
  registrationOpen: boolean
}) {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pickedSide = sides.find((s) => s.slug === picked) ?? null

  async function join() {
    if (busy || !pickedSide) return
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    if (!registrationOpen) {
      toast({
        title: "아직 참가 접수 전입니다",
        description: "채널 공개 시점에 맞춰 열립니다.",
      })
      return
    }
    if (
      !confirm(
        `${pickedSide.club_kor} 진영으로 참가합니다. 한 번 고른 진영은 이벤트가 끝날 때까지 바꿀 수 없습니다. 진행할까요?`
      )
    )
      return

    setBusy(true)
    try {
      const res = await fetch("/api/event/cog/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_slug: pickedSide.slug,
          traffic_source: getAttribution()?.source ?? null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        toast({ title: "이미 참가 중입니다", description: "현황으로 이동합니다." })
        router.refresh()
        return
      }
      if (!res.ok) throw new Error(data.error || "등록에 실패했습니다.")
      toast({ title: "참가가 끝났습니다", description: "이제 예측만 하면 됩니다." })
      router.refresh()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "등록 실패",
        description: e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mx-auto grid w-full gap-3 sm:max-w-[880px] sm:grid-cols-2">
        {sides.map((s) => {
          const mine = picked === s.slug
          return (
            <button
              key={s.slug}
              type="button"
              onClick={() => setPicked(s.slug)}
              disabled={busy}
              aria-pressed={mine}
              className="relative min-h-[196px] overflow-hidden rounded-xl text-left transition-transform active:scale-[.99] disabled:cursor-not-allowed"
              style={{
                background: "var(--wc-card)",
                border: mine ? `2px solid ${s.color}` : "1px solid var(--wc-line)",
                boxShadow: mine ? "var(--wc-shadow-2)" : "var(--wc-shadow-1)",
              }}
            >
              {/* 상단 스트라이프 — 라이트 존에서 팀 컬러가 허용되는 자리 */}
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 block"
                style={{ height: mine ? 5 : 3, background: s.color }}
              />

              <div className="flex h-full flex-col p-5 pt-6">
                <span
                  className="text-[12px] font-extrabold"
                  style={{ color: "var(--wc-mute)", letterSpacing: "0.06em" }}
                >
                  {s.creator} 진영
                </span>
                <span
                  className="mt-1.5 text-[30px] leading-none"
                  style={{
                    fontFamily: "var(--font-display-ko), var(--font-title)",
                    fontWeight: 700,
                    color: s.color,
                    letterSpacing: "-.02em",
                  }}
                >
                  {s.club_kor}
                </span>
                <p
                  className="mt-2 text-[12.5px] font-semibold italic"
                  style={{ color: "var(--wc-mute)", wordBreak: "keep-all", lineHeight: 1.5 }}
                >
                  {s.motto}
                </p>

                <div
                  className="mt-auto flex flex-wrap items-center justify-between gap-1 pt-4 text-[12.5px] font-bold"
                  style={{ color: "var(--wc-mute-2)" }}
                >
                  {/* 0 카운트 비노출 규칙 — 참가자가 생기기 전엔 모집 문구로 */}
                  <span className="gn-num" style={{ wordBreak: "keep-all" }}>
                    {s.regCount > 0
                      ? `${s.regCount.toLocaleString()}명 참가 중`
                      : "선착순 아님, 자존심순"}
                  </span>
                  {mine ? (
                    <span className="inline-flex items-center gap-1" style={{ color: s.color }}>
                      <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> 선택함
                    </span>
                  ) : (
                    <span style={{ color: "var(--wc-burgundy)", wordBreak: "keep-all" }}>
                      이 진영 고르기
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* 확정 — 카드 클릭과 분리한다. 되돌릴 수 없는 선택이라 한 번 더 손이 가야 한다 */}
      <div className="mt-6 flex flex-col items-center gap-2.5">
        <button
          type="button"
          onClick={join}
          disabled={busy || !pickedSide}
          className="inline-flex items-center gap-2 rounded-[12px] px-6 py-3.5 text-[15.5px] font-extrabold transition-transform active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            background: "linear-gradient(100deg, var(--wc-burgundy), var(--gn-bg-700))",
            color: "var(--gn-cream)",
            boxShadow: pickedSide ? "0 12px 30px -12px rgba(150,30,55,.7)" : "none",
          }}
        >
          {busy && <Loader2 className="h-[17px] w-[17px] animate-spin" aria-hidden />}
          {pickedSide ? `${pickedSide.club_kor} 진영으로 참가하기` : "진영을 먼저 고르세요"}
          {!busy && pickedSide && <ArrowRight className="h-[17px] w-[17px]" aria-hidden />}
        </button>
        <p
          className="text-[12.5px]"
          style={{ color: "var(--wc-mute)", wordBreak: "keep-all", textAlign: "center" }}
        >
          한 번 고른 진영은 이벤트가 끝날 때까지 바꿀 수 없습니다.
        </p>
      </div>
    </div>
  )
}
