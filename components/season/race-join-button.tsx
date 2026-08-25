"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth, useClerk } from "@clerk/nextjs"
import { ArrowRight, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { getAttribution } from "@/lib/analytics/attribution"

/**
 * 개막 기념 승부예측 이벤트 원클릭 참가 버튼 — 아스날 단독 전환(2026-08-14)으로 팀 선택 UI 가
 * 사라진 자리. S0(비로그인)은 로그인 모달, S1(로그인)은 즉시 등록.
 * 성공/409 → router.refresh() 로 같은 /season 이 S2 허브로 인라인 전환된다
 * (리다이렉트 금지 — 참가 직후 페이지가 "변신"하는 것 자체가 보상).
 *
 * ⚠️ traffic_source: getAttribution() — 최초터치 UTM → 참가 귀속의 유일한 발사 지점.
 *    구 team-picker.tsx 에서 이식. 누락하면 유튜버별 귀속이 소급 불가로 증발한다.
 *
 * 라벨은 로그인 여부와 무관하게 하나다. 비로그인은 클릭 시 로그인 모달이 뜨므로
 * 라벨에 로그인을 앞세워 마찰을 미리 보여줄 이유가 없다 (카피 검수 §2-6).
 * 부수 효과로 서버/클라이언트 라벨 분기가 사라져 hydration 위험(Clerk #418)도 없다.
 */
export function RaceJoinButton({ registrationOpen }: { registrationOpen: boolean }) {
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
        toast({ title: "이미 참가 중입니다", description: "이벤트 허브로 이동합니다." })
        router.refresh()
        return
      }
      if (!res.ok) throw new Error(data.error || "등록에 실패했습니다.")
      toast({ title: "등록됐습니다", description: "이제 예측만 하면 됩니다." })
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
      className="inline-flex items-center gap-2 rounded-[12px] px-6 py-3.5 text-[16px] font-extrabold transition-transform active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-70"
      style={{
        background: "linear-gradient(100deg, var(--wc-burgundy), var(--gn-bg-700))",
        color: "var(--gn-cream)",
        boxShadow: "0 12px 30px -12px rgba(150,30,55,.7)",
      }}
    >
      {busy && <Loader2 className="h-[17px] w-[17px] animate-spin" aria-hidden />}
      구너로 참가하기
      {!busy && <ArrowRight className="h-[17px] w-[17px]" aria-hidden />}
    </button>
  )
}
