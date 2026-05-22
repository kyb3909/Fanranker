/**
 * [Moderator] 콘텐츠 관리 접근 — moderator(bot02)가 관리자 콘텐츠 페이지에
 * 진입할 수 있는지 검증. requireAdmin 이 moderator 를 허용하므로 진입 성공해야 함.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()
const modBot = bots.find((b) => b.index === 2)

for (let run = 1; run <= REPEAT; run++) {
  test(`[Moderator] 콘텐츠 관리 접근 #${run}`, async ({ page }, testInfo) => {
    test.skip(!modBot, "moderator 봇(bot02) 없음 — E2E_BOT_COUNT>=2 필요")
    const errors = collectErrors(page)

    await loginAs(page, modBot!)
    await page.goto("/admin/content/reports")
    await page.waitForTimeout(2000)

    // moderator 는 콘텐츠 관리 페이지에 머무를 수 있어야 함 (홈으로 안 튕김)
    expect(page.url(), "moderator 가 콘텐츠 관리에서 차단됨").toContain("/admin/content/reports")

    await finishJourney(errors, testInfo)
  })
}
