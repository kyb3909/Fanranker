import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireStaff } from "@/lib/admin/roles"
import AdminReportsPage from "@/app/admin/content/reports/page"

export const metadata: Metadata = { title: "신고 처리" }
export const dynamic = "force-dynamic"

/**
 * /admin2/reports — 신고 처리를 작업대 안에서.
 *
 * 커뮤글 검수와 같은 방식으로 기존 화면을 재사용한다. 신고 큐는 처리 버튼이
 * 3개뿐이고(검토중·처리·기각) 화면 자체는 잘 돌아간다 — 문제는 작업대에서
 * 나가야 했다는 것뿐이었다.
 *
 * ⚠️ 신고 처리는 **admin 전용**이다. "처리(resolve)"를 누르는 순간 사유별로
 * 옐로/레드 카드가 자동 발급되고 옐로 2장이면 계정이 정지된다 — 제재 권한이므로
 * 검수만 맡긴 editor 에게 열지 않는다.
 */
export default async function Admin2ReportsPage() {
  const role = await requireStaff().catch(() => null)
  if (role !== "admin") redirect("/admin2")

  return <AdminReportsPage />
}
