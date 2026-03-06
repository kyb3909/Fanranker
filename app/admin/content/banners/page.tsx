import type { Metadata } from "next"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { BannerManagement } from "./banner-management"

export const metadata: Metadata = { title: "배너 관리" }
export const dynamic = "force-dynamic"

export default async function AdminBannersPage() {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from("announcement_banners")
    .select("*")
    .order("sort_order", { ascending: true })

  return (
    <main id="main-content" tabIndex={-1} className="space-y-6 p-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold">배너 관리</h1>
        <p className="text-muted-foreground text-sm">
          홈 화면 상단 캐러솔 배너를 관리합니다. 이미지 또는 그라데이션+텍스트 형태로 표시됩니다.
        </p>
      </div>
      <BannerManagement initialBanners={data ?? []} />
    </main>
  )
}
