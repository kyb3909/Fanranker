/**
 * [Member] 댓글 작성 — 4단계 검증.
 *   UI 액션(댓글 입력·제출) → UI 검증(댓글 노출) → DB 검증(comments 행) → 부가.
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
  test(`[Member] 댓글 작성 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)
    const postId = await createPost(bot, `[E2E픽스처] 댓글대상 b${bot.index}-r${run}-${Date.now()}`)
    const content = `E2E 댓글 b${bot.index}-r${run}-${Date.now()}`

    await loginAs(page, bot)
    await page.goto(`/post/${postId}`)

    // 1) UI 액션: 댓글 입력 + 제출
    await page.getByRole("textbox", { name: /댓글을 입력하세요/ }).fill(content)
    await page.getByRole("button", { name: "댓글 작성" }).click()

    // 2) DB 검증: comments 행 존재 (실제 truth)
    await expectDBRecord("comments", {
      post_id: postId,
      user_id: bot.clerkUserId,
      content,
    })

    // 3) UI 검증: 새로고침 후 댓글이 렌더링됨
    await page.reload()
    await expect(page.getByText(content).first()).toBeVisible({ timeout: 10_000 })

    await finishJourney(errors, testInfo)
  })
}
