import type { Metadata } from "next"
import { PartnerClient } from "./partner-client"

/**
 * 팬 굿즈 공동제작 — **파트너(권리자 · 대행사) 지면**.
 *
 * `/goods-lab` 과 갈라 둔 이유는 청중이 다르기 때문이다. 팬은 벽을 훑고 품목을 고른다.
 * 파트너는 승인 절차와 수요 데이터를 본다. 한 화면에 두면 둘 다 흐려지고,
 * 팬 화면에 MOQ · 배분표 · 시나리오 토글이 새어 나온다.
 *
 * 미팅은 이 화면에서 시작해 팬 화면으로 내려가는 순서를 전제로 만들었다 —
 * 상단 링크로 오갈 수 있다.
 */
export const metadata: Metadata = {
  title: "팬 굿즈 공동제작 · 파트너 (시연)",
  description: "권리 승인 절차와 구단별 · 품목별 수요 데이터 — 시연용",
  robots: { index: false, follow: false },
}

export default function GoodsLabPartnerPage() {
  return <PartnerClient />
}
