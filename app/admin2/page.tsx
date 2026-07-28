import type { Metadata } from "next"
import { Workbench } from "./workbench"
import { InsightCard } from "./insight-card"

export const metadata: Metadata = { title: "운영 작업대" }
export const dynamic = "force-dynamic"

export default function Admin2Page() {
  return (
    <div className="space-y-4">
      {/* 위: 지금 상태와 할 일(초 단위 판단) / 아래: 이번 주 방향(분 단위 판단) */}
      <Workbench />
      <InsightCard />
    </div>
  )
}
