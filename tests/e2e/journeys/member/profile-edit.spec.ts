/**
 * [Member] 프로필 편집 — 4단계 검증.
 * 본인 프로필 → 설정 탭 → 자기소개 변경 → 저장 → profiles.bio 반영 확인.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 프로필 편집 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)
    const newBio = `E2E 자기소개 b${bot.index}-r${run}-${Date.now()}`

    await loginAs(page, bot)
    await page.goto(`/profile/${bot.clerkUserId}`)

    // 1) UI 액션: 설정 탭 → 자기소개 변경 → 저장
    await page.getByRole("tab", { name: "설정" }).click()
    await page.getByPlaceholder("자신을 한 줄로 소개해보세요").fill(newBio)
    await page.getByRole("button", { name: "변경사항 저장" }).click()
    await page.waitForTimeout(1000)

    // 2~3) DB 검증: profiles.bio 반영
    await expectDBRecord("profiles", { user_id: bot.clerkUserId, bio: newBio })

    await finishJourney(errors, testInfo)
  })
}
