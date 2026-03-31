import type { Metadata } from "next"
import { StickerQueue } from "./sticker-queue"

export const metadata: Metadata = { title: "스티커 승인" }
export const dynamic = "force-dynamic"

export default function AdminStickersPage() {
  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">스티커 관리</h1>
        <p className="text-muted-foreground text-sm">
          유저가 업로드한 스티커를 검토하고 승인/거절합니다.
        </p>
      </div>
      <StickerQueue />
    </main>
  )
}
