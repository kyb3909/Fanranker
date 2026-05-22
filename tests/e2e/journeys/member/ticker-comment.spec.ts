/**
 * [Member] 뉴스 티커 댓글 — 4단계 검증.
 * 커뮤니티 티커 → 상세 패널 → 댓글 입력 → Enter → ticker_comments 행 생성.
 * 티커는 스크롤 애니메이션 중이라 force 클릭한다.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 뉴스 티커 댓글 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)
    const content = `E2E 티커댓글 b${bot.index}-r${run}-${Date.now()}`

    await loginAs(page, bot)
    await page.goto("/community/football")

    // 1) UI 액션: 티커 항목 클릭(애니메이션 중 → force) → 상세 패널 댓글 입력 → Enter
    await page
      .getByRole("button", { name: "E2E 뉴스 티커 헤드라인" })
      .first()
      .click({ force: true })
    const input = page.getByPlaceholder(/댓글을 입력하세요/)
    await input.fill(content)
    await input.press("Enter")
    await page.waitForTimeout(1500)

    // 2~3) DB 검증: ticker_comments 행 존재
    await expectDBRecord("ticker_comments", { user_id: bot.clerkUserId, content })

    await finishJourney(errors, testInfo)
  })
}
