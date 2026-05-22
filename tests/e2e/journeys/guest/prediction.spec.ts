/**
 * [Guest] 승부예측 페이지 열람 (베팅 제외) — 탭/필터를 전환한다.
 * 마이페이지 탭은 비로그인 시 /sign-up 으로 이탈하므로 클릭하지 않는다.
 */
import { test, expect } from "@playwright/test"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

for (let run = 1; run <= REPEAT; run++) {
  test(`[Guest] 승부예측 페이지 열람 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    await page.goto("/prediction")
    await expect(page).toHaveURL(/\/prediction/)
    await expect(page.getByRole("heading").first()).toBeVisible()

    // 베팅 헤더 탭 전환 (마이페이지 제외 — 비로그인 이탈)
    for (const tab of ["베팅", "랭킹", "통계"]) {
      const el = page.getByRole("tab", { name: tab }).or(page.getByRole("button", { name: tab }))
      if (await el.count()) {
        await el.first().click()
        await page.waitForTimeout(150)
      }
    }

    await finishJourney(errors, testInfo)
  })
}
