/**
 * [Member] 작성자 검색 — 타인 글의 더보기 메뉴에서 작성자로 검색.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { createPost } from "../../helpers/fixtures"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 작성자 검색 #${run}`, async ({ page }, testInfo) => {
    const idx = testInfo.parallelIndex % bots.length
    const bot = bots[idx]
    const targetBot = bots[(idx + 1) % bots.length]
    const errors = collectErrors(page)
    const postId = await createPost(
      targetBot,
      `[E2E픽스처] 검색대상 b${targetBot.index}-r${run}-${Date.now()}`
    )

    await loginAs(page, bot)
    await page.goto(`/post/${postId}`)

    // 1) UI 액션: 더보기 → 해당 아이디로 검색
    await page.getByRole("button", { name: "더보기 메뉴" }).click()
    await page.getByRole("menuitem", { name: /검색/ }).click()

    // 2) UI 검증: 검색 페이지로 이동
    await expect(page).toHaveURL(/\/search/)

    await finishJourney(errors, testInfo)
  })
}
