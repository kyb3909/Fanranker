import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { GALLERY } from "../../fixtures"
import { DesignClient } from "./design-client"

/**
 * 작가 작업 화면 — `/goods-lab/design/[pieceId]`.
 *
 * 팬 다이얼로그 안에 넣었다가 뺐다. 마플 캔버스가 740×740, 레드버블 프리뷰가 685×911 인데
 * 우리 다이얼로그는 672px 이라 캔버스가 370px 로 쭈그러들었다(2026-09-05 실측).
 * 두 곳 다 에디터는 전용 전체 화면이다.
 */
export const metadata: Metadata = {
  title: "굿즈 배치 (시연)",
  description: "작가가 품목마다 그림 위치 · 크기 · 재질을 정하는 화면 — 시연용",
  robots: { index: false, follow: false },
}

export default async function DesignPage({ params }: { params: Promise<{ pieceId: string }> }) {
  const { pieceId } = await params
  const piece = GALLERY.find((g) => g.id === pieceId)
  if (!piece) notFound()
  return <DesignClient piece={piece} />
}
