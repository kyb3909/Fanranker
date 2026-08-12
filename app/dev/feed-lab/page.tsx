import type { Metadata } from "next"
import { FeedLab } from "./feed-lab"

export const metadata: Metadata = {
  title: "피드 카드 실험실 (dev)",
  robots: { index: false, follow: false },
}

/**
 * /dev/feed-lab — 떡밥 카드 레이아웃 변주 비교 (2026-08-12).
 *
 * 운영자: "디자인이 조악해졌어 ... 수십개의 가능성들을 샘플로 보여줘봐 내가 선택할게"
 *
 * 디자인 패널 4인(29CM 편집 / 인터랙션 / 정보구조 / 회의론)이 낸 변주를 **같은 데이터로**
 * 나란히 렌더한다. 말이 아니라 픽셀로 고르기 위한 화면이다.
 * dev 전용 — GNB 미노출, noindex. 결정이 끝나면 삭제한다.
 */
export default function FeedLabPage() {
  return <FeedLab />
}
