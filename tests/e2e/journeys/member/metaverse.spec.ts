/**
 * [Member] 메타버스 플레이 진입 — 로그인 회원이 메타버스 씬(highbury)에 진입.
 * 비로그인은 홈으로 튕기므로, URL 이 유지되면 회원 진입이 성공한 것.
 * Phaser 캔버스 내부 동작은 E2E 로 깊게 검증하지 않는다.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 메타버스 플레이 진입 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)

    await loginAs(page, bot)
    await page.goto("/metaverse/highbury")
    await page.waitForTimeout(1500)

    // 비로그인이면 /로 리다이렉트됨 — URL 유지 = 회원 진입 성공
    await expect(page).toHaveURL(/\/metaverse\/highbury/)

    await finishJourney(errors, testInfo)
  })
}
