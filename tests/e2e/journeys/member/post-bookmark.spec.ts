/**
 * [Member] 게시글 북마크 — 4단계 검증.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord } from "../../helpers/db-verifier"
import { createPost } from "../../helpers/fixtures"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 게시글 북마크 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)
    const postId = await createPost(
      bot,
      `[E2E픽스처] 북마크대상 b${bot.index}-r${run}-${Date.now()}`
    )

    await loginAs(page, bot)
    await page.goto(`/post/${postId}`)

    // 1) UI 액션: 북마크
    await page.getByRole("button", { name: "북마크" }).click()
    await page.waitForTimeout(500)

    // 2~3) DB 검증: bookmarks 행 존재
    await expectDBRecord("bookmarks", { post_id: postId, user_id: bot.clerkUserId })

    await finishJourney(errors, testInfo)
  })
}
