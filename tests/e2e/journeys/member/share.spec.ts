/**
 * [Member] 게시글 공유 — 공유 메뉴 열림 확인 (DB 변경 없는 UI 저니).
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { createPost } from "../../helpers/fixtures"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 게시글 공유 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)
    const postId = await createPost(bot, `[E2E픽스처] 공유대상 b${bot.index}-r${run}-${Date.now()}`)

    await loginAs(page, bot)
    await page.goto(`/post/${postId}`)

    // 1) UI 액션: 공유 버튼
    await page.getByRole("button", { name: "공유" }).click()

    // 2) UI 검증: 공유 메뉴(링크 복사 등)가 열림
    await expect(page.getByText("링크 복사").first()).toBeVisible()

    await finishJourney(errors, testInfo)
  })
}
