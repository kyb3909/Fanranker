/**
 * [Member] 월드컵 베팅 페이지 — /worldcup/games 진입 확인.
 * 이벤트 상태(open)에 따라 안내/활성 모드로 렌더 — 페이지가 정상 로드되는지 검증.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 월드컵 베팅 페이지 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)

    await loginAs(page, bot)
    await page.goto("/worldcup/games")

    await expect(page).toHaveURL(/\/worldcup\/games/)
    await expect(page.getByRole("banner").first()).toBeVisible()

    await finishJourney(errors, testInfo)
  })
}
