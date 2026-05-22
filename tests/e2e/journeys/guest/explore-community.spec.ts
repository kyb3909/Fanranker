/**
 * [Guest] 게시판 둘러보기 + 커뮤니티 페이지 열람.
 * /explore 정렬 탭 전환 후 시드 카테고리 커뮤니티 페이지로 진입.
 */
import { test, expect } from "@playwright/test"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

for (let run = 1; run <= REPEAT; run++) {
  test(`[Guest] 게시판 둘러보기 + 커뮤니티 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    await page.goto("/explore")
    await expect(page).toHaveURL(/\/explore/)
    await expect(page.getByRole("heading").first()).toBeVisible()

    // 정렬 탭: 추천순 / 댓글순 / 조회순 (있을 때만)
    for (const label of ["추천순", "댓글순", "조회순"]) {
      const el = page.getByRole("button", { name: label })
      if (await el.count()) {
        await el.first().click()
        await page.waitForTimeout(150)
      }
    }

    // 시드 카테고리 커뮤니티 페이지
    await page.goto("/community/football")
    await expect(page).toHaveURL(/\/community\/football/)
    await expect(page.getByRole("heading").first()).toBeVisible()

    await finishJourney(errors, testInfo)
  })
}
