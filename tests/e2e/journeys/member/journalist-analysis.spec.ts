/**
 * [Journalist] 베팅 슬립에 분석글 작성 — 4단계 검증.
 * 기자(bot04)가 베팅 슬립 제출 시 분석글 제목·본문을 함께 저장 →
 * prediction_slips.analysis_text 반영 확인.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()
const journalist = bots.find((b) => b.index === 4)

for (let run = 1; run <= REPEAT; run++) {
  test(`[Journalist] 베팅 슬립 분석글 작성 #${run}`, async ({ page }, testInfo) => {
    test.skip(!journalist, "기자 봇(bot04) 없음 — E2E_BOT_COUNT>=4 필요")
    const j = journalist!
    const errors = collectErrors(page)
    const analysisText = `E2E 분석글 본문 r${run}-${Date.now()}`

    await loginAs(page, j)
    await page.goto("/prediction")

    // 1) UI 액션: 배당 선택 → 슬립 펼치기 → 금액 + 분석글 입력 → 예측하기
    await page.locator('button:has-text("E2E 홈팀2.00")').click()
    await page.getByRole("button", { name: /예측 슬립 펼치기/ }).click()
    await page.locator('input[type="number"]').fill("1")
    await page.getByPlaceholder("분석글 제목 (선택)").fill(`E2E 분석 제목 r${run}`)
    await page.getByPlaceholder(/분석글을 작성하세요/).fill(analysisText)
    await page.getByRole("button", { name: /예측하기/ }).click()

    // 2~3) DB 검증: analysis_text 가 담긴 슬립 생성
    await expectDBRecord(
      "prediction_slips",
      { user_id: j.clerkUserId, analysis_text: analysisText },
      { timeoutMs: 12_000 }
    )

    await finishJourney(errors, testInfo)
  })
}
