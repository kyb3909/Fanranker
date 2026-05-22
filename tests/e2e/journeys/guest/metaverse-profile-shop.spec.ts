/**
 * [Guest] 메타버스 진입(게스트 경로) + 공개 프로필 열람 + 상점 열람.
 */
import { test, expect } from "@playwright/test"
import { collectErrors } from "../../helpers/error-collector"
import { getDBRecords } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

for (let run = 1; run <= REPEAT; run++) {
  test(`[Guest] 메타버스 진입 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    // 국가 선택 화면 (Phaser 미사용 — 가벼움)
    await page.goto("/metaverse")
    await expect(page).toHaveURL(/\/metaverse/)
    await page.waitForTimeout(500)

    await finishJourney(errors, testInfo)
  })

  test(`[Guest] 공개 프로필 열람 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    const profiles = await getDBRecords("profiles", {})
    expect(profiles.length).toBeGreaterThan(0)
    const userId = profiles[0].user_id as string

    await page.goto(`/profile/${userId}`)
    await expect(page.getByRole("banner")).toBeVisible()
    await page.waitForTimeout(800)

    await finishJourney(errors, testInfo)
  })

  test(`[Guest] 상점 열람 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    await page.goto("/shop")
    await expect(page).toHaveURL(/\/shop/)
    await expect(page.getByRole("heading").first()).toBeVisible()

    await finishJourney(errors, testInfo)
  })
}
