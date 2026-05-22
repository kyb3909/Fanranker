/**
 * [Member] 이상형 월드컵 게임 — 게임 페이지 + 시드 방 진입 검증.
 *
 * 참고: 시드 방(이름만 있는 후보 4)에서 "시작하기" 버튼이 disabled 상태였음
 * (후보 이미지 누락 또는 게임 미완성 추정) — 시작·투표 단계는 미검증.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 이상형 월드컵 게임 진입 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)

    await loginAs(page, bot)
    await page.goto("/games/worldcup")

    // 1) UI 액션: 시드된 월드컵 방 진입
    await page
      .getByRole("button", { name: /E2E 이상형 월드컵/ })
      .first()
      .click()

    // 2) UI 검증: 게임 뷰 진입 (시작하기 버튼 노출)
    await expect(page.getByRole("button", { name: "시작하기" })).toBeVisible()

    await finishJourney(errors, testInfo)
  })
}
