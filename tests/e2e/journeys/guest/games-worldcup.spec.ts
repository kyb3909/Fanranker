/**
 * [Guest] 게임 플레이 열람 + 월드컵 이벤트 열람.
 */
import { test, expect } from "@playwright/test"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

for (let run = 1; run <= REPEAT; run++) {
  test(`[Guest] 게임 플레이 열람 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    // /games → /games/galcup 리다이렉트
    await page.goto("/games")
    await expect(page).toHaveURL(/\/games/)
    await expect(page.getByRole("banner")).toBeVisible()

    await finishJourney(errors, testInfo)
  })

  test(`[Guest] 월드컵 이벤트 열람 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    await page.goto("/worldcup")
    await expect(page).toHaveURL(/\/worldcup/)
    await expect(page.getByRole("heading").first()).toBeVisible()

    await page.goto("/worldcup/leaderboard")
    await expect(page).toHaveURL(/\/worldcup\/leaderboard/)

    await finishJourney(errors, testInfo)
  })
}
