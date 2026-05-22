/**
 * [Member] 게시글 신고 — 4단계 검증.
 * 신고는 타인 글 대상이므로 픽스처 게시글은 다른 봇 소유로 생성한다.
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
  test(`[Member] 게시글 신고 #${run}`, async ({ page }, testInfo) => {
    const idx = testInfo.parallelIndex % bots.length
    const bot = bots[idx]
    const targetBot = bots[(idx + 1) % bots.length]
    const errors = collectErrors(page)
    const postId = await createPost(
      targetBot,
      `[E2E픽스처] 신고대상 b${targetBot.index}-r${run}-${Date.now()}`
    )

    await loginAs(page, bot)
    await page.goto(`/post/${postId}`)

    // 1) UI 액션: 더보기 → 신고하기 → 사유 선택 → 신고 접수
    await page.getByRole("button", { name: "더보기 메뉴" }).click()
    await page.getByRole("menuitem", { name: /신고/ }).click()
    await page.getByText("차별적 표현").click()
    await page.getByRole("button", { name: "신고 접수" }).click()
    await page.waitForTimeout(1000)

    // 2~3) DB 검증: content_reports 행 존재
    await expectDBRecord("content_reports", {
      reporter_id: bot.clerkUserId,
      target_type: "post",
      target_id: postId,
    })

    await finishJourney(errors, testInfo)
  })
}
