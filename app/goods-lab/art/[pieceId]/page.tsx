import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { FAN_SCENE, GOAL, findPiece, pieceDemand } from "../../fixtures"
import { ArtClient } from "./art-client"

type Props = {
  params: Promise<{ pieceId: string }>
  searchParams: Promise<{ item?: string | string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pieceId } = await params
  const piece = findPiece(pieceId)
  if (!piece) return { title: "작품을 찾을 수 없습니다", robots: { index: false, follow: false } }
  const title = `${piece.title} — ${piece.creator} · 굿즈랩`
  const description = piece.opened
    ? `시연 · 관심 요청 ${pieceDemand(piece, FAN_SCENE)}건 · 품목별 ${GOAL}명이 모이면 제작 검토를 시작해요. ${piece.description}`
    : `시연 · 작품 전시 중. ${piece.description}`
  const image = piece.image ?? `/goods-lab/previews/${piece.id}.png`
  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: `/goods-lab/art/${piece.id}` },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/goods-lab/art/${piece.id}`,
      images: [{ url: image, alt: piece.title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}

export default async function ArtPage({ params, searchParams }: Props) {
  const [{ pieceId }, { item }] = await Promise.all([params, searchParams])
  const piece = findPiece(pieceId)
  if (!piece) notFound()
  return (
    <ArtClient
      key={piece.id}
      piece={piece}
      sharedItemId={typeof item === "string" ? item : undefined}
    />
  )
}
