import type { Metadata } from "next"
import { MinimalShopContent } from "@/components/minimal-sport/minimal-shop-content"

export const metadata: Metadata = {
  title: "상점",
  description: "밈 스티커, 칭호, 픽셀아트를 활동 포인트로 구매하세요",
}

export default function ShopRoute() {
  return <MinimalShopContent />
}
