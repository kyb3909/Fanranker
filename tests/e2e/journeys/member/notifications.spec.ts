/**
 * [Member] 알림 확인 — 헤더 알림 드롭다운을 연다.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 알림 확인 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)

    await loginAs(page, bot)
    // 헤더가 회원 상태로 하이드레이션될 때까지 대기 (클릭 경합 방지)
    await expect(page.locator('header button[aria-label="사용자 메뉴"]')).toBeVisible()

    // 1) UI 액션: 헤더 알림 드롭다운 열기
    const notifBtn = page.locator('header button[aria-label="알림"]')
    await notifBtn.click()

    // 2) UI 검증: 드롭다운이 열림 (트리거 aria-expanded)
    await expect(notifBtn).toHaveAttribute("aria-expanded", "true")

    await finishJourney(errors, testInfo)
  })
}
