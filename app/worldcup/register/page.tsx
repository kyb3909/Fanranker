import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { ArrowLeft } from "lucide-react"
import { currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { RegisterClient } from "@/components/worldcup/register-client"

export const metadata: Metadata = {
  title: "월드컵 이벤트 참가 신청",
  description:
    "아스날 구너로 월드컵 승부예측에 참가 신청하세요. 신청은 무료, 한 번 신청하면 변경할 수 없습니다.",
  alternates: { canonical: "/worldcup/register" },
}

// 로그인/등록 상태 분기 — 동적
export const dynamic = "force-dynamic"

const EVENT_SLUG = "worldcup-2026"

export default async function WorldcupRegisterPage() {
  // 이미 등록한 구너는 바로 경기 일정·예측 화면으로 보냄
  const user = await currentUser()
  if (user) {
    const supabase = createServiceRoleClient()
    const { data: ev } = await supabase
      .from("events")
      .select("id")
      .eq("slug", EVENT_SLUG)
      .maybeSingle<{ id: string }>()
    if (ev) {
      const { data: reg } = await supabase
        .from("event_registrations")
        .select("id")
        .eq("event_id", ev.id)
        .eq("user_id", user.id)
        .maybeSingle()
      if (reg) redirect("/worldcup/games")
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
      <div className="mx-auto max-w-[640px] px-6 pt-10 pb-16">
        <Link
          href="/worldcup"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: "var(--wc-mute)" }}
        >
          <ArrowLeft className="h-4 w-4" /> 이벤트 안내로
        </Link>
        <div className="wc-sec-eb" style={{ marginTop: 22, marginBottom: 8 }}>
          PRE-REGISTER
        </div>
        <h1
          className="text-[30px] font-extrabold sm:text-[38px]"
          style={{ letterSpacing: "-.03em", lineHeight: 1.15 }}
        >
          월드컵 참가 신청
        </h1>
        <p
          className="mt-2.5 mb-8 text-[15px]"
          style={{ lineHeight: 1.6, color: "var(--wc-ink-2)" }}
        >
          아스날 구너로 월드컵 승부예측 대결에 참가 신청합니다. 신청을 마치면 바로 경기 일정과
          예측이 열립니다.
        </p>
        <RegisterClient />
      </div>
    </div>
  )
}
