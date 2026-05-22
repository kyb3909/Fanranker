/**
 * [Member] 경기장 기여 — 4단계 검증.
 * 프로필 팬 정체성 탭 → flair 활동점수를 경기장에 기부 →
 * stadium_contributions 행 생성 (donate_flair_score_to_team RPC).
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 경기장 기여 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)

    await loginAs(page, bot)
    await page.goto(`/profile/${bot.clerkUserId}`)

    // 1) UI 액션: 팬 정체성 탭 → 기부 점수 입력 → 경기장 기부
    await page.getByRole("tab", { name: "팬 정체성" }).click()
    await page.getByPlaceholder("기부 점수").fill("100")
    await page.getByRole("button", { name: "경기장 기부" }).click()
    await page.waitForTimeout(1500)

    // 2~3) DB 검증: stadium_contributions 행 존재
    await expectDBRecord("stadium_contributions", {
      user_id: bot.clerkUserId,
      team_id: "e2e-team",
    })

    await finishJourney(errors, testInfo)
  })
}
