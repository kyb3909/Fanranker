/** Isolated member journey: submit, visible result, persisted pick/balance, refresh, retry. */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { getDBRecords, expectDBRecord } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"
const bots = loadBots()
for (let run = 1; run <= REPEAT; run++) {
  test("[Member] 승부예측 저장·잔액·새로고침·재시도 #" + run, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)
    await loginAs(page, bot)
    const balanceResponse = await page.request.get("/api/tokens/balance")
    expect(balanceResponse.ok()).toBe(true)
    const beforeBalance = Number((await balanceResponse.json()).balance)
    expect(beforeBalance).toBeGreaterThanOrEqual(1)
    const before = await getDBRecords("prediction_slips", { user_id: bot.clerkUserId })
    await page.goto("/prediction")
    await page.getByRole("button", { name: /E2E 홈팀\s*2\.00/ }).click()
    await page.getByRole("button", { name: /예측 슬립 펼치기/ }).click()
    await page.locator('input[type="number"]').fill("1")
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/sports/prediction") && r.request().method() === "POST"
    )
    await page.getByRole("button", { name: /예측하기/ }).click()
    const submitted = await responsePromise
    expect(submitted.ok()).toBe(true)
    const result = await submitted.json()
    expect(result).toMatchObject({ success: true, ballsUsed: 1, remainingBalls: beforeBalance - 1 })
    await expect(page.getByRole("heading", { name: "예측 완료!" })).toBeVisible()
    const slip = await expectDBRecord("prediction_slips", {
      id: result.slipId,
      user_id: bot.clerkUserId,
    })
    expect(Number(slip.stake)).toBe(1)
    const picks = await getDBRecords("betman_predictions", {
      slip_id: result.slipId,
      user_id: bot.clerkUserId,
    })
    expect(picks).toHaveLength(1)
    expect(picks[0]).toMatchObject({ prediction: "home", status: "pending", locked_odds: 2 })
    expect((await getDBRecords("prediction_slips", { user_id: bot.clerkUserId })).length).toBe(
      before.length + 1
    )
    expect(
      Number((await expectDBRecord("user_tokens", { user_id: bot.clerkUserId })).token_balance)
    ).toBe(beforeBalance - 1)
    await page.reload()
    const afterBalance = await page.request.get("/api/tokens/balance")
    expect(afterBalance.ok()).toBe(true)
    expect((await afterBalance.json()).balance).toBe(beforeBalance - 1)
    const history = await page.request.get("/api/sports/prediction?status=all")
    expect(history.ok()).toBe(true)
    expect((await history.json()).slips).toContainEqual(
      expect.objectContaining({ id: result.slipId })
    )
    const payload = submitted.request().postDataJSON()
    expect(payload.idempotency_key).toBeTruthy()
    const repeated = await page.request.post("/api/sports/prediction", { data: payload })
    expect(repeated.ok()).toBe(true)
    expect(await repeated.json()).toMatchObject({ duplicate: true, slipId: result.slipId })
    expect(
      Number((await expectDBRecord("user_tokens", { user_id: bot.clerkUserId })).token_balance)
    ).toBe(beforeBalance - 1)
    expect((await getDBRecords("prediction_slips", { user_id: bot.clerkUserId })).length).toBe(
      before.length + 1
    )
    await finishJourney(errors, testInfo)
  })
}
