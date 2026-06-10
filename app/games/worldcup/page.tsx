import { notFound } from "next/navigation"

/**
 * 이상형 월드컵 — 숨김 처리 (Phase 2, AUDIT_REPORT H-목록).
 *
 * redirect 가 아닌 notFound 인 이유: 의도가 명시적이고, 재오픈 시 이 파일만
 * 원복하면 된다 (components/worldcup/worldcup-page-client.tsx 는 보존됨).
 */
export default function GamesWorldcupPage() {
  notFound()
}
