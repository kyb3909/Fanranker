"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth, useClerk } from "@clerk/nextjs"
import { ArrowRight, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { getAttribution } from "@/lib/analytics/attribution"

/**
 * 구너스 레이스 원클릭 참가 버튼 — 아스날 단독 전환(2026-08-14)으로 팀 선택 UI 가
 * 사라진 자리. S0(비로그인)은 로그인 모달, S1(로그인)은 즉시 등록.
 * 성공/409 → router.refresh() 로 같은 /season 이 S2 허브로 인라인 전환된다
 * (리다이렉트 금지 — 참가 직후 페이지가 "변신"하는 것 자체가 보상).
 *
 * ⚠️ traffic_source: getAttribution() — 최초터치 UTM → 참가 귀속의 유일한 발사 지점.
 *    구 team-picker.tsx 에서 이식. 누락하면 유튜버별 귀속이 소급 불가로 증발한다.
 *
 * 라벨은 서버가 판정한 signedIn 을 그대로 그린다 (클라이언트 useAuth 로 라벨을
 * 바꾸면 hydration 불일치 위험 — Clerk #418 계열). 클릭 동작만 라이브 상태를 쓴다.
 */
export function RaceJoinButton({
  signedIn,
  registrationOpen,
}: {
  signedIn: boolean
  registrationOpen: boolean
}) {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [busy, setBusy] = useState(false)

  async function join() {
    if (busy) return
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    if (!registrationOpen) {
      toast({ title: "등록 기간이 아닙니다", description: "이벤트 오픈 후 참가할 수 있어요." })
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/event/season/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_slug: "gooner",
          traffic_source: getAttribution()?.source ?? null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        // 다른 기기에서 이미 참가한 경우 — 허브로 그대로 전환
        toast({ title: "이미 참가 중입니다", description: "레이스 허브로 이동합니다." })
        router.refresh()
        return
      }
      if (!res.ok) throw new Error(data.error || "등록에 실패했습니다.")
      toast({ title: "참가 완료", description: "이제 픽 하나면 순위표에 올라갑니다." })
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
    <button
      type="button"
      onClick={join}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-[12px] px-6 py-3.5 text-[15.5px] font-extrabold transition-transform active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-70"
      style={{
        background: "linear-gradient(100deg, var(--wc-burgundy), var(--gn-bg-700))",
        color: "var(--gn-cream)",
        boxShadow: "0 12px 30px -12px rgba(150,30,55,.7)",
      }}
    >
      {busy && <Loader2 className="h-[17px] w-[17px] animate-spin" aria-hidden />}
      {signedIn ? "참가하고 레이스 시작" : "로그인하고 참가하기"}
      {!busy && <ArrowRight className="h-[17px] w-[17px]" aria-hidden />}
    </button>
  )
}
