/**
 * [Member] 마이페이지 열람 — 내 게시글 / 내 예측 / 결제 내역.
 * 페이지 로드 sweep: 로그인 상태로 진입해 앱 셸이 렌더되는지 + 에러 수집.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

const PAGES = [
  { path: "/my-posts", label: "내 게시글" },
  { path: "/my-predictions", label: "내 예측" },
  { path: "/payments", label: "결제 내역" },
]

for (let run = 1; run <= REPEAT; run++) {
  for (const { path, label } of PAGES) {
    test(`[Member] ${label} 페이지 #${run}`, async ({ page }, testInfo) => {
      const bot = bots[testInfo.parallelIndex % bots.length]
      const errors = collectErrors(page)

      await loginAs(page, bot)
      await page.goto(path)

      await expect(page).toHaveURL(new RegExp(path))
      // 앱 셸이 렌더됐는지 — 500/크래시면 헤더가 없다
      await expect(page.getByRole("banner")).toBeVisible()

      await finishJourney(errors, testInfo)
    })
  }
}
