/**
 * [Member] 월드컵 이벤트 그룹 등록 — 4단계 검증.
 * 그룹 선택 → 약관 동의 → 등록 완료 → event_registrations 행 생성.
 * 등록은 1회만 가능하므로 기존 등록을 먼저 제거한다.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord, dbClient } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 월드컵 그룹 등록 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)

    // 클린 상태: 기존 등록 제거 (등록은 이벤트당 1회)
    await dbClient().from("event_registrations").delete().match({ user_id: bot.clerkUserId })

    await loginAs(page, bot)
    await page.goto("/worldcup/register")

    // 1) UI 액션: 그룹 선택 → 약관 동의 → 등록 완료
    await page.getByRole("button", { name: /Gooner/ }).click()
    await page.getByRole("checkbox").first().click()
    await page.getByRole("button", { name: "등록 완료" }).click()
    await page.waitForTimeout(1500)

    // 2~3) DB 검증: event_registrations 행 존재
    await expectDBRecord("event_registrations", { user_id: bot.clerkUserId })

    await finishJourney(errors, testInfo)
  })
}
