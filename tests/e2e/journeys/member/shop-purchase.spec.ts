/**
 * [Member] 상점 — 스티커 구매. 4단계 검증.
 * "100P" → 확인 다이얼로그 → 구매 → user_stickers 행 생성 (골드 차감).
 * 재구매 불가하므로 기존 구매를 먼저 제거한다.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord, dbClient } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 스티커 구매 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)

    // 클린 상태: 기존 구매 제거 (재구매 가능하게)
    await dbClient().from("user_stickers").delete().match({ user_id: bot.clerkUserId })

    await loginAs(page, bot)
    await page.goto("/shop")

    // 1) UI 액션: 스티커 100P 클릭 → 확인 다이얼로그 → 구매
    await page.getByRole("button", { name: "100P", exact: true }).click()
    await page.getByRole("button", { name: /구매/ }).click()
    await page.waitForTimeout(1500)

    // 2~3) DB 검증: user_stickers 행 존재
    await expectDBRecord("user_stickers", { user_id: bot.clerkUserId })

    await finishJourney(errors, testInfo)
  })
}
