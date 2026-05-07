import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { RegisterClient } from "@/components/worldcup/register-client"

export const metadata: Metadata = {
  title: "월드컵 이벤트 사전 등록",
  description:
    "응원 그룹을 골라 월드컵 승부예측 그룹 대결에 참여하세요. 한 번 선택한 그룹은 변경할 수 없습니다.",
  alternates: { canonical: "/worldcup/register" },
}

export default function WorldcupRegisterPage() {
  return (
    <div className="px-4 pt-6 pb-16 sm:pt-10">
      <div className="mx-auto max-w-3xl">
        <header className="wc-reg-head">
          <Link href="/worldcup" className="wc-reg-head-back">
            ← 이벤트 안내로
          </Link>
          <div className="wc-reg-head-eb">STEP 01 / 사전 등록</div>
          <h1>응원 그룹 선택</h1>
          <p className="wc-reg-head-sub">
            한 번에 한 그룹만 가입할 수 있고, 등록 후 변경할 수 없습니다.
          </p>
        </header>

        <RegisterClient />
      </div>
    </div>
  )
}
