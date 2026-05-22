/**
 * [Member] 커뮤니티(게시판) 팔로우 — 4단계 검증.
 * 토글 오염을 막기 위해 기존 팔로우를 먼저 제거하고 시작한다.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord, dbClient } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()
const COMMUNITY = "football"

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 커뮤니티 팔로우 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)

    // 클린 상태: 기존 팔로우 제거 → UI 클릭은 항상 "팔로우(추가)"
    await dbClient()
      .from("community_follows")
      .delete()
      .match({ user_id: bot.clerkUserId, community_slug: COMMUNITY })

    await loginAs(page, bot)
    await page.goto(`/community/${COMMUNITY}`)

    // 1) UI 액션: 팔로우
    await page.getByRole("button", { name: "팔로우", exact: true }).first().click()
    await page.waitForTimeout(800)

    // 2~3) DB 검증: community_follows 행 존재
    await expectDBRecord("community_follows", {
      user_id: bot.clerkUserId,
      community_slug: COMMUNITY,
    })

    await finishJourney(errors, testInfo)
  })
}
