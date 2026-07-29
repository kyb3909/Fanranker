/**
 * [Member] 승부예측 베팅 (슬립 제출) — 4단계 검증.
 *   배당 선택 → 슬립 펼치기 → 금액 입력 → 예측하기 → prediction_slips 행 증가.
 * betman 시드 경기(E2E 홈팀 vs E2E 원정팀) 대상.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { getDBRecords } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 승부예측 베팅 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)

    const before = (await getDBRecords("prediction_slips", { user_id: bot.clerkUserId })).length

    await loginAs(page, bot)
    await page.goto("/prediction")

    // 1) UI 액션: 배당 선택 → 슬립 펼치기 → 금액 → 예측하기
    await page.locator('button:has-text("E2E 홈팀2.00")').click()
    await page.getByRole("button", { name: /예측 슬립 펼치기/ }).click()
    await page.locator('input[type="number"]').fill("1")
    await page.getByRole("button", { name: /예측하기/ }).click()

    // 2~3) DB 검증: prediction_slips 행이 증가할 때까지 폴링
    let after = before
    for (let i = 0; i < 30 && after <= before; i++) {
      after = (await getDBRecords("prediction_slips", { user_id: bot.clerkUserId })).length
      if (after <= before) await new Promise((r) => setTimeout(r, 300))
    }
    expect(after, "베팅 슬립(prediction_slips)이 생성되지 않음").toBeGreaterThan(before)

    await finishJourney(errors, testInfo)
  })
}
