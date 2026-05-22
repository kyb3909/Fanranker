/**
 * [Member] 작성자 차단 — 4단계 검증.
 * 타인 글의 더보기 메뉴에서 차단. 차단 행이 user_blocks 에 생겨야 한다.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord, dbClient } from "../../helpers/db-verifier"
import { createPost } from "../../helpers/fixtures"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 작성자 차단 #${run}`, async ({ page }, testInfo) => {
    const idx = testInfo.parallelIndex % bots.length
    const bot = bots[idx]
    const targetBot = bots[(idx + 1) % bots.length]
    const errors = collectErrors(page)
    const postId = await createPost(
      targetBot,
      `[E2E픽스처] 차단대상 b${targetBot.index}-r${run}-${Date.now()}`
    )

    // 클린 상태: 기존 차단 제거
    await dbClient()
      .from("user_blocks")
      .delete()
      .match({ blocker_id: bot.clerkUserId, blocked_id: targetBot.clerkUserId })

    page.on("dialog", (d) => d.accept())
    await loginAs(page, bot)
    await page.goto(`/post/${postId}`)

    // 1) UI 액션: 더보기 → 차단하기
    await page.getByRole("button", { name: "더보기 메뉴" }).click()
    await page.getByRole("menuitem", { name: /차단/ }).click()
    await page.waitForTimeout(1000)

    // 2~3) DB 검증: user_blocks 행 존재
    await expectDBRecord("user_blocks", {
      blocker_id: bot.clerkUserId,
      blocked_id: targetBot.clerkUserId,
    })

    await finishJourney(errors, testInfo)
  })
}
