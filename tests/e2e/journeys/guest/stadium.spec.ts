/**
 * [Guest] 경기장(스타디움) 시스템 열람 — 월드맵 진입 + 로드 확인.
 */
import { test, expect } from "@playwright/test"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

for (let run = 1; run <= REPEAT; run++) {
  test(`[Guest] 경기장 시스템 열람 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    await page.goto("/stadium")
    await expect(page).toHaveURL(/\/stadium/)
    await expect(page.getByRole("heading").first()).toBeVisible()
    await page.waitForTimeout(500)

    await finishJourney(errors, testInfo)
  })
}
