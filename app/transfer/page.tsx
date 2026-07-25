import { createServiceRoleClient } from "@/lib/supabase/server"
import { fetchTransferFeed } from "@/lib/transfer/feed"
import { TransferBoardClient } from "./transfer-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "이적시장 상황판 — 해외축구 이적 오피셜·루머 한눈에 | gongnori.fan",
  description:
    "해외축구 여름 이적시장의 오피셜, Here we go, 루머를 실시간 타임라인으로. 로마노·온스테인 등 티어별 신뢰도 분류.",
}

export default async function TransferPage() {
  const supabase = createServiceRoleClient()
  const items = await fetchTransferFeed(supabase)
  return <TransferBoardClient initialItems={items} />
}
