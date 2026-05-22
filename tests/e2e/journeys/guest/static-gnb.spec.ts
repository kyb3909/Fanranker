/**
 * [Guest] 정적 페이지 열람 + GNB / 전역 레이아웃 인터랙션.
 */
import { test, expect } from "@playwright/test"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

for (let run = 1; run <= REPEAT; run++) {
  test(`[Guest] 정적 페이지 열람 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    for (const path of ["/about", "/terms", "/privacy", "/content-policy"]) {
      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(path))
      await expect(page.getByRole("heading").first()).toBeVisible()
    }

    await finishJourney(errors, testInfo)
  })

  test(`[Guest] GNB 전역 레이아웃 인터랙션 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    await page.goto("/")
    // GNB 네비게이션: 운동장 / 승부예측 / 월드컵
    for (const [name, pattern] of [
      ["운동장", /\/explore/],
      ["경기 예측", /\/prediction/],
      ["월드컵 이벤트", /\/worldcup/],
    ] as const) {
      await page.getByRole("link", { name }).first().click()
      await expect(page).toHaveURL(pattern)
    }
    // 홈 복귀
    await page.getByRole("link", { name: "담벼락" }).first().click()
    await expect(page).toHaveURL(/localhost:3100\/$/)

    await finishJourney(errors, testInfo)
  })
}
