import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireStaff } from "@/lib/admin/roles"
import { DrawClient } from "./draw-client"

export const metadata: Metadata = { title: "주간 추첨" }
export const dynamic = "force-dynamic"

/**
 * /admin2/draw — 주간 경품 추첨을 운영자가 직접 돌리는 화면.
 *
 * 자동 cron 이 아니라 수동인 이유: **추첨하는 장면 자체가 콘텐츠**이기 때문이다
 * (크리에이터 방송·영상 소재). 대신 공정성을 위해 후보 명단은 월요일 cron 이
 * 미리 확정하고 해시를 남긴다 — 여기서는 뽑기만 한다.
 *
 * ⚠️ **admin 전용.** 경품이 걸린 추첨이라 검수만 맡긴 editor 에게 열지 않는다.
 */
export default async function Admin2DrawPage() {
  const role = await requireStaff()
  if (role !== "admin") redirect("/admin2")

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <DrawClient />
    </div>
  )
}
