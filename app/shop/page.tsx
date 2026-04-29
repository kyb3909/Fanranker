import type { Metadata } from "next"
import { Suspense } from "react"
import { ActivitySidebar } from "@/components/sidebar/activity-sidebar"
import ShopPage from "@/components/shop/shop-page"
import { MinimalShopContent } from "@/components/minimal-sport/minimal-shop-content"

export const metadata: Metadata = {
  title: "상점",
  description: "밈 스티커, 칭호, 픽셀아트를 활동 포인트로 구매하세요",
}

function ShopSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="bg-muted h-40 rounded-2xl" />
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-muted h-12 flex-1 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="bg-muted aspect-square rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export default function ShopRoute() {
  return (
    <>
      {/* 데스크톱(lg+): Minimal Sport 셸 + 기존 ShopPage */}
      <MinimalShopContent />

      {/* 모바일/태블릿: 기존 layout */}
      <main
        id="main-content"
        className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6 lg:hidden"
        tabIndex={-1}
      >
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          <div className="col-span-12 min-w-0 overflow-hidden lg:col-span-9">
            <Suspense fallback={<ShopSkeleton />}>
              <ShopPage />
            </Suspense>
          </div>
          <aside className="col-span-3 hidden lg:block">
            <Suspense fallback={<div className="bg-muted h-40 animate-pulse rounded-xl" />}>
              <ActivitySidebar />
            </Suspense>
          </aside>
        </div>
      </main>
    </>
  )
}
