/**
 * [Admin] Admin 콘솔 페이지 sweep.
 *
 * bot01(role=admin)으로 모든 /admin 라우트에 진입해 앱 셸이 렌더되는지 +
 * 에러를 수집한다. adminGuard 가 admin 을 막거나 페이지가 깨지면 드러난다.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()
const adminBot = bots[0] // bot01 = role:admin (seed.ts)

const ROUTES = [
  { path: "/admin", label: "콘솔 진입" },
  { path: "/admin/analytics", label: "분석 대시보드" },
  { path: "/admin/stats", label: "통계" },
  { path: "/admin/experts", label: "전문가 인증" },
  { path: "/admin/settlements", label: "정산" },
  { path: "/admin/notes", label: "관리자 메모" },
  { path: "/admin/matches", label: "경기 관리" },
  { path: "/admin/operations", label: "운영 모니터링" },
  { path: "/admin/users", label: "사용자 디렉토리" },
  { path: "/admin/event", label: "월드컵 이벤트 운영" },
  { path: "/admin/system", label: "시스템 상태" },
  { path: "/admin/refunds", label: "환불 큐" },
  { path: "/admin/tokens", label: "토큰/골드 경제" },
  { path: "/admin/content/posts", label: "콘텐츠 게시글" },
  { path: "/admin/content/comments", label: "콘텐츠 댓글" },
  { path: "/admin/content/ticker", label: "콘텐츠 뉴스티커" },
  { path: "/admin/content/boards", label: "콘텐츠 게시판" },
  { path: "/admin/content/banners", label: "콘텐츠 배너" },
  { path: "/admin/content/stickers", label: "콘텐츠 스티커" },
  { path: "/admin/content/reports", label: "콘텐츠 신고검토" },
  { path: "/admin/content/metaverse-reports", label: "콘텐츠 메타버스신고" },
  { path: "/admin/content/newsroom", label: "콘텐츠 뉴스룸" },
]

for (let run = 1; run <= REPEAT; run++) {
  for (const { path, label } of ROUTES) {
    test(`[Admin] ${label} #${run}`, async ({ page }, testInfo) => {
      const errors = collectErrors(page)

      await loginAs(page, adminBot)
      await page.goto(path)

      // adminGuard 가 막으면 /나 /sign-up 으로 튕긴다 — admin 인데 막히면 결함
      expect(page.url(), `${path} 접근 실패 (리다이렉트됨)`).toContain(path)
      // admin 레이아웃 렌더 확인 (admin 은 공개 헤더 대신 "관리자 패널" 사이드바)
      await expect(page.getByRole("link", { name: "관리자 패널" })).toBeVisible()

      await finishJourney(errors, testInfo)
    })
  }
}
