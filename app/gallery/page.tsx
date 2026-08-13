import type { Metadata } from "next"
import { PageBand } from "@/components/page-band"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { GalleryClient, type GalleryItem } from "./gallery-client"

export const revalidate = 60

export const metadata: Metadata = {
  title: "아이돌 갤러리",
  description:
    "찍덕들의 사진을 모아 보는 갤러리. 모든 사진은 원문 트윗을 참조하며 출처를 함께 표기합니다.",
  alternates: { canonical: "/gallery" },
}

/**
 * /gallery — 아이돌 갤러리 (2026-08-14 운영자 요청).
 *
 * 저작권 원칙: 이미지를 퍼오지(재호스팅하지) 않는다. 운영자가 큐레이션한 트윗의
 * X CDN 참조만 저장하고 브라우저가 X 에서 직접 받는다 — 원본이 지워지면 여기서도
 * 사라진다 (찍덕 통제권 유지). 출처는 라이트박스 하단에 상시 표기.
 * GNB 미노출 — 직접 URL (떡밥·게임과 같은 숨김 라우트 패턴).
 */
export default async function GalleryPage() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from("gallery_items")
    .select("id, tweet_url, author_name, author_handle, media, tag")
    .order("created_at", { ascending: false })
    .limit(200)

  return (
    <div className="worldcup-scope wc-board-canvas min-h-[100dvh]">
      <PageBand
        kicker="Gallery"
        title="아이돌 갤러리"
        description="사진을 누르면 슬라이드쇼 — 좌우 키로 넘겨보세요"
      />
      <main
        id="main-content"
        className="container mx-auto max-w-[1280px] px-4 py-6 sm:px-6"
        tabIndex={-1}
      >
        <GalleryClient items={(data ?? []) as GalleryItem[]} />
        <p className="mt-8 text-center text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
          모든 사진의 저작권은 촬영자에게 있으며, 원문 트윗을 통해 표시됩니다.
          <br />
          촬영자가 원문을 삭제하면 갤러리에서도 더 이상 표시되지 않습니다.
        </p>
      </main>
    </div>
  )
}
