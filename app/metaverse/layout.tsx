import { redirect } from "next/navigation"

/**
 * /metaverse/* 레거시 테스트 라우트 통합 (2026-07-02).
 *
 * 월드맵(/metaverse, /uk)·하이버리(/highbury)·프로토타입(/prototype)은 시기별로
 * 만든 아바타 공간 테스트인데, 정식 라운지(/lounge)와 채널이 달라 유저들이
 * 서로 다른 공간에 흩어져 "서로 안 보이는" 혼란을 만들었다.
 * 프로덕션에서는 전부 /lounge 로 리다이렉트 — 공간은 라운지 하나로 통일.
 * dev 에서는 씬/에셋 개발용으로 그대로 접근 가능.
 * (interior-demo 는 자체 layout 의 notFound 가드가 먼저 적용됨)
 */
export default function MetaverseLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") redirect("/lounge")
  return <>{children}</>
}
