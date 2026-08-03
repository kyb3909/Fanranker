/**
 * [Guest] 사가 인덱스 + 상세 열람 (W1 스모크).
 *
 * 로컬 e2e Supabase 에는 시드 사가가 없을 수 있다 — 빈 인덱스도 정상 상태로
 * 취급하고, 카드가 있을 때만 상세까지 내려간다 (프로덕션 시드 의존 금지).
 */
import { test, expect } from "@playwright/test"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

for (let run = 1; run <= REPEAT; run++) {
  test(`[Guest] 사가 인덱스 열람 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    await page.goto("/saga")
    await expect(page.getByRole("heading", { name: "이적 사가" })).toBeVisible()

    const cards = page.locator('a[href^="/saga/"]')
    const cardCount = await cards.count()
    if (cardCount === 0) {
      // 빈 상태 문구가 떠야 한다 — 흰 화면이면 데이터 아닌 렌더 문제
      await expect(page.getByText("아직 열린 사가가 없습니다")).toBeVisible()
    } else {
      // 상세: 진행 단계 스테퍼 + 메인 투표 + 타임라인 + 댓글 섹션
      await cards.first().click()
      await expect(page).toHaveURL(/\/saga\/[a-z0-9-]+/)
      await expect(page.getByRole("list", { name: "진행 단계" })).toBeVisible()
      await expect(page.getByText("명 참여")).toBeVisible()
      await expect(page.getByRole("heading", { name: /타임라인/ })).toBeVisible()
      await expect(page.getByRole("region", { name: "댓글" })).toBeVisible()
    }

    await finishJourney(errors, testInfo)
  })
}
