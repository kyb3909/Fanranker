/**
 * [Guest] 홈 피드 탐색 — 비로그인 방문자가 홈에서 탭/정렬을 전환한다.
 * 읽기 전용 저니이므로 DB 검증 없음. 페이지 구조 + 인터랙션 + 에러 수집.
 */
import { test, expect } from "@playwright/test"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

for (let run = 1; run <= REPEAT; run++) {
  test(`[Guest] 홈 피드 탐색 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

    // 탭 전환: 게시물 ↔ 경기 분석글 (탭 선택 상태 확인)
    await page.getByRole("tab", { name: "경기 분석글" }).click()
    await expect(page.getByRole("tab", { name: "경기 분석글", selected: true })).toBeVisible()
    await page.getByRole("tab", { name: "게시물" }).click()
    await expect(page.getByRole("tab", { name: "게시물", selected: true })).toBeVisible()

    // 정렬 전환: 랜덤 / 온도순 / 최신순
    for (const sort of ["랜덤", "온도순", "최신순"]) {
      await page.getByRole("button", { name: sort }).click()
      await page.waitForTimeout(150)
    }

    await finishJourney(errors, testInfo)
  })
}
