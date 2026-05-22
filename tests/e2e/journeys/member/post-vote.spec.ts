/**
 * [Member] 게시글 추천 / 비추천 — 4단계 검증.
 * 각 테스트는 픽스처 게시글(추천 0)에서 시작해 토글 오염이 없다.
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
  test(`[Member] 게시글 추천 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)
    const postId = await createPost(bot, `[E2E픽스처] 추천대상 b${bot.index}-r${run}-${Date.now()}`)

    await loginAs(page, bot)
    await page.goto(`/post/${postId}`)

    // 1) UI 액션: 추천 ("추천"은 "비추천"의 부분 문자열이므로 exact 필요)
    await page.getByRole("button", { name: "추천", exact: true }).click()
    await page.waitForTimeout(500)

    // 2~3) DB 검증: 투표 행 + posts.vote_count 증가(트리거)
    await expectDBRecord("post_votes", {
      post_id: postId,
      user_id: bot.clerkUserId,
      vote_type: "up",
    })
    await expectDBRecord("posts", { id: postId, vote_count: 1 })

    await finishJourney(errors, testInfo)
  })

  test(`[Member] 게시글 비추천 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)
    const postId = await createPost(
      bot,
      `[E2E픽스처] 비추천대상 b${bot.index}-r${run}-${Date.now()}`
    )

    await loginAs(page, bot)
    await page.goto(`/post/${postId}`)

    await page.getByRole("button", { name: "비추천" }).click()
    await page.waitForTimeout(500)

    await expectDBRecord("post_votes", {
      post_id: postId,
      user_id: bot.clerkUserId,
      vote_type: "down",
    })

    await finishJourney(errors, testInfo)
  })
}
