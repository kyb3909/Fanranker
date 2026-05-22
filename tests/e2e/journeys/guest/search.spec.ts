/**
 * [Guest] 검색 — ?q= 로 진입 시 자동 검색되는 경로를 검증한다.
 * 시드 게시글 제목에 "게시글" 이 포함돼 결과가 나온다.
 */
import { test, expect } from "@playwright/test"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

for (let run = 1; run <= REPEAT; run++) {
  test(`[Guest] 검색 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    await page.goto(`/search?q=${encodeURIComponent("게시글")}`)
    await expect(page).toHaveURL(/\/search/)
    await expect(page.getByRole("heading").first()).toBeVisible()
    // 검색 결과 영역이 렌더링될 때까지 대기 (결과 또는 빈 상태)
    await page.waitForTimeout(800)

    await finishJourney(errors, testInfo)
  })
}
