import { redirect } from "next/navigation"

/**
 * /metaverse/uk (폐기된 월드맵) — 프로덕션은 정식 스타디움으로 통일 (2026-07-02).
 * page 가 "use client" 라 서버 redirect 는 layout 에서 처리. dev 는 개발용 유지.
 */
export default function UkLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") redirect("/metaverse/highbury")
  return <>{children}</>
}
