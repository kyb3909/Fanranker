/**
 * [Member] 로그인 / 로그아웃.
 *
 * 봇은 sign-in token(ticket)으로 인증한다 — 새 기기 이메일 2차 인증을 우회.
 * 봇 계정 자체는 실제 id+password 회원이다.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs, logout } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 로그인 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)

    await loginAs(page, bot)

    // 인증 세션 확립 확인
    const userId = await page.evaluate(
      () => (window as unknown as { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id ?? null
    )
    expect(userId).toBe(bot.clerkUserId)

    await finishJourney(errors, testInfo)
  })

  test(`[Member] 로그아웃 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)

    await loginAs(page, bot)
    await logout(page)

    const userId = await page.evaluate(
      () => (window as unknown as { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id ?? null
    )
    expect(userId).toBeNull()

    await finishJourney(errors, testInfo)
  })
}
