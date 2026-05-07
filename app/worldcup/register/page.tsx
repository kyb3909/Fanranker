import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { RegisterClient } from "@/components/worldcup/register-client"

export const metadata: Metadata = {
  title: "월드컵 이벤트 사전 등록",
  description:
    "응원 그룹을 골라 월드컵 승부예측 그룹 대결에 참여하세요. 모든 참가자에게 동일한 이벤트 전용 잔고가 부여됩니다.",
  alternates: { canonical: "/worldcup/register" },
}

export default function WorldcupRegisterPage() {
  return (
    <div className="bg-background min-h-screen">
      <section className="border-border border-b">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
          <Link
            href="/worldcup"
            className="text-muted-foreground hover:text-foreground inline-block text-[13px] transition-colors"
          >
            ← 이벤트 안내로
          </Link>
          <div className="font-title mt-4 mb-3 text-[12px] font-bold tracking-[0.1em] text-amber-600 uppercase dark:text-amber-400">
            STEP 01 / 사전 등록
          </div>
          <h1 className="font-title text-foreground text-4xl leading-[1.1] font-bold tracking-tight sm:text-5xl">
            응원 그룹 선택
          </h1>
          <p className="text-muted-foreground mt-4 text-[15px] leading-[1.65]">
            한 그룹에만 가입할 수 있고, 등록 후 변경할 수 없습니다. 모든 참가자에게 동일한 이벤트
            전용 잔고가 지급됩니다.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-2xl px-4 py-10">
          <RegisterClient />
        </div>
      </section>
    </div>
  )
}
