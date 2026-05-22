/**
 * [Expert] 유료 예측 콘텐츠 생성 — 4단계 검증.
 * 전문가(bot03)가 베팅 예측을 제출하면 prediction_activities 행(판매 가능한
 * 예측 콘텐츠)이 생성된다.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { getDBRecords } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()
const expert = bots.find((b) => b.index === 3)

for (let run = 1; run <= REPEAT; run++) {
  test(`[Expert] 유료 예측 콘텐츠 생성 #${run}`, async ({ page }, testInfo) => {
    test.skip(!expert, "전문가 봇(bot03) 없음 — E2E_BOT_COUNT>=3 필요")
    const e = expert!
    const errors = collectErrors(page)

    const before = (await getDBRecords("prediction_activities", { user_id: e.clerkUserId })).length

    await loginAs(page, e)
    await page.goto("/prediction")

    // 1) UI 액션: 베팅 예측 제출
    await page.locator('button:has-text("E2E 홈팀2.00")').click()
    await page.getByRole("button", { name: /베팅 슬립 펼치기/ }).click()
    await page.locator('input[type="number"]').fill("1")
    await page.getByRole("button", { name: /예측하기/ }).click()

    // 2~3) DB 검증: prediction_activities(판매 콘텐츠) 증가
    let after = before
    for (let i = 0; i < 30 && after <= before; i++) {
      after = (await getDBRecords("prediction_activities", { user_id: e.clerkUserId })).length
      if (after <= before) await new Promise((r) => setTimeout(r, 300))
    }
    expect(after, "전문가 예측 콘텐츠(prediction_activities)가 생성되지 않음").toBeGreaterThan(
      before
    )

    await finishJourney(errors, testInfo)
  })
}
