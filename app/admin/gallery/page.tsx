import type { Metadata } from "next"
import { GalleryManager } from "@/components/admin/gallery-manager"

export const metadata: Metadata = { title: "아이돌 갤러리 관리" }
export const dynamic = "force-dynamic"

/**
 * 아이돌 갤러리 큐레이션 — 찍덕 트윗 URL 등록/삭제.
 * 이미지 재호스팅 없음(X CDN 참조만) — 저작권 원칙은 /gallery 페이지 주석 참조.
 */
export default function AdminGalleryPage() {
  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">아이돌 갤러리 관리</h1>
        <p className="text-muted-foreground text-sm">
          찍덕 트윗 URL 을 붙여넣으면 사진 메타만 저장됩니다 (이미지 재호스팅 없음). 사진이 없는
          트윗은 등록되지 않습니다. 갤러리는 <b>/gallery</b> (GNB 미노출) 에서 보입니다.
        </p>
      </div>
      <GalleryManager />
    </main>
  )
}
