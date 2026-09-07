import type { Metadata } from "next"
import { ItemsClient } from "./items-client"

/**
 * 품목 카탈로그 — "무엇을 만들 수 있고, 무엇은 왜 아직 못 만드나" (2026-09-08, 2단계).
 *
 * ⚠️ 파는 품목을 늘리는 화면이 **아니다.** 판매는 여전히 인쇄 소품 3종뿐이고, 나머지는
 *    왜 아직 아닌지를 같은 표 안에서 밝힌다 — 미팅에서 "왜 티셔츠는 없나"가 반드시 나오는데,
 *    그때 답이 화면에 없으면 준비가 안 된 것으로 읽힌다.
 *
 * 데이터는 `fixtures.ts` 정적값. DB·API 를 건드리지 않는다.
 */
export const metadata: Metadata = {
  title: "굿즈 품목 (시연)",
  description: "지금 만들 수 있는 품목과, 아직 못 만드는 품목의 이유 — 시연용",
  robots: { index: false, follow: false },
}

export default function ItemsPage() {
  return <ItemsClient />
}
