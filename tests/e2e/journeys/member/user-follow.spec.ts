/**
 * [Member] 유저 팔로우 — 기자(journalist) 공개 프로필에서 팔로우.
 * 기자만 팔로우 대상이 될 수 있으므로 bot04(is_journalist)를 대상으로 한다.
 * 4단계 검증: 팔로우 클릭 → user_follows 행 생성.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord, dbClient } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()
const journalist = bots.find((b) => b.index === 4)

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 유저 팔로우 #${run}`, async ({ page }, testInfo) => {
    test.skip(!journalist, "기자 봇(bot04) 없음 — E2E_BOT_COUNT>=4 필요")
    const j = journalist!
    // 대상이 자기 자신이면 다른 봇으로 (자기 팔로우 불가)
    const picked = bots[testInfo.parallelIndex % bots.length]
    const bot = picked.index === 4 ? bots[0] : picked
    const errors = collectErrors(page)

    // 클린 상태: 기존 팔로우 제거
    await dbClient()
      .from("user_follows")
      .delete()
      .match({ follower_id: bot.clerkUserId, followed_user_id: j.clerkUserId })

    await loginAs(page, bot)
    await page.goto(`/profile/${j.clerkUserId}`)

    // 1) UI 액션: 팔로우 (기자 프로필에만 노출되는 버튼)
    await page
      .getByRole("button", { name: /팔로우/ })
      .first()
      .click()
    await page.waitForTimeout(800)

    // 2~3) DB 검증: user_follows 행 존재
    await expectDBRecord("user_follows", {
      follower_id: bot.clerkUserId,
      followed_user_id: j.clerkUserId,
    })

    await finishJourney(errors, testInfo)
  })
}
