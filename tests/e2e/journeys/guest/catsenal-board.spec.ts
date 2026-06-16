import { test, expect } from "@playwright/test"
import { collectErrors } from "../../helpers/error-collector"
import { finishJourney, REPEAT } from "../../helpers/journey"

// 캣스날 크리에이터 보드 스모크: 레이아웃 렌더 + hero iframe lazy 로드 검증.
for (let run = 1; run <= REPEAT; run++) {
  test(`[Guest] 캣스날 크리에이터 보드 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    await page.goto("/community/catsenal")
    await expect(page).toHaveURL(/\/community\/catsenal/)

    // 크리에이터 보드 레이아웃(배너 + 최근영상 + 커뮤니티글)이 렌더되는가
    await expect(page.getByTestId("creator-board")).toBeVisible()
    await expect(page.getByTestId("creator-hero")).toBeVisible()
    await expect(page.getByTestId("creator-recent")).toBeVisible()
    await expect(page.getByTestId("creator-posts")).toBeVisible()

    // 초기 로드 시 iframe 이 박혀있지 않아야 함 (재생 클릭 전 lazy)
    await expect(page.getByTestId("creator-hero-iframe")).toHaveCount(0)

    // 영상이 싱크돼 있으면: 재생 클릭 → 그 자리에서 iframe 등장
    const play = page.getByTestId("creator-hero-play")
    if (await play.count()) {
      await play.first().click()
      await expect(page.getByTestId("creator-hero-iframe")).toBeVisible()
    }

    await finishJourney(errors, testInfo)
  })
}
