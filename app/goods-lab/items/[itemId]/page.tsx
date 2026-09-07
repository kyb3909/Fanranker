import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ITEMS, STAGE_POLICY } from "../../fixtures"
import { ItemClient } from "./item-client"

type Props = { params: Promise<{ itemId: string }> }

/** URL 입력에 fallback 을 쓰지 않는다 — 없는 품목은 404 다 (작품 라우트와 같은 규율) */
function find(id: string) {
  return ITEMS.find((i) => i.id === id)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { itemId } = await params
  const item = find(itemId)
  if (!item) return { title: "품목을 찾을 수 없습니다", robots: { index: false, follow: false } }
  return {
    title: `${item.name} — 굿즈 품목 (시연)`,
    description: `${STAGE_POLICY[item.stage].label} · ${item.note}`,
    robots: { index: false, follow: false },
    alternates: { canonical: `/goods-lab/items/${item.id}` },
  }
}

export default async function ItemPage({ params }: Props) {
  const { itemId } = await params
  const item = find(itemId)
  if (!item) notFound()
  return <ItemClient key={item.id} item={item} />
}
