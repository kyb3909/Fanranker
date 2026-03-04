import type { Metadata } from "next"
import { PenaltyKickClient } from "./penalty-kick-client"

export const metadata: Metadata = {
  title: "페널티킥",
  description: "타이밍에 맞춰 골을 넣고 골드를 획득하세요!",
}

export default function PenaltyKickPage() {
  return <PenaltyKickClient />
}
