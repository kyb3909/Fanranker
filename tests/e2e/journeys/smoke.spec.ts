/**
 * Harness smoke test — validates the full E2E chain end to end:
 *   bot factory → sign-in token → ticket login → app on local Supabase.
 *
 * Not a user journey. Confirms the infrastructure works before the real
 * journey specs are added.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../setup/bot-factory"
import { loginAs } from "../helpers/auth"
import { collectErrors } from "../helpers/error-collector"

const bots = loadBots()

test("봇이 로그인하고 인증 세션이 확립된다", async ({ page }, testInfo) => {
  const bot = bots[testInfo.parallelIndex % bots.length]
  const collector = collectErrors(page)

  await loginAs(page, bot)

  const userId = await page.evaluate(
    () => (window as unknown as { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id ?? null
  )
  expect(userId).toBe(bot.clerkUserId)

  collector.dispose()
})
