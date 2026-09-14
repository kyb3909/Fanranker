import { requireAdminPageAccess } from "@/lib/admin/page-access"
import { SellerRewardQueue } from "./queue"
export default async function SellerRewardsPage() {
  await requireAdminPageAccess("/admin/seller-rewards")
  return (
    <main className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">판매자 미지급</h1>
      <p className="text-muted-foreground text-sm">
        오래 기다린 50건부터 표시합니다. 구매별 지급 원장을 확인해 중복 지급을 막습니다. 과거 구매는
        기존 지급 내역 대사가 필요합니다.
      </p>
      <SellerRewardQueue />
    </main>
  )
}
