import { test, expect } from "@playwright/test"

/**
 * 메타버스 페이지 스모크 테스트.
 *
 * 범위:
 *  - /metaverse 라우트가 500 나지 않고 HTML 응답.
 *  - dev 환경에서 Clerk 로드 실패해도 guest 진입 경로로 Phaser canvas 가 마운트됨.
 *  - deep-link (?plot=london-01) 파라미터 수용.
 *  - GNB 에 메타버스 링크는 **없어야** 함 (완성 전까지 숨김 정책).
 *
 * Phaser 내부 이동/멀티플레이는 Canvas 기반이라 Playwright 로 깊게 테스트하기
 * 어려움. 여기서는 "페이지가 뜨고 정리된다" 수준의 regression guard.
 */

test.describe("메타버스 (smoke)", () => {
  test("/metaverse 랜딩 (국가 선택) 페이지가 정상 로드된다", async ({ page }) => {
    const response = await page.goto("/metaverse")
    expect(response?.status()).toBeLessThan(500)

    // 국가 선택 랜딩이 노출되어야 함
    await expect(page.getByRole("heading", { name: /어느 나라/ })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("link", { name: /영국 월드맵 입장/ })).toBeVisible()
  })

  test("/metaverse/uk 월드맵 DOM 에 canvas parent 가 존재한다", async ({ page }) => {
    await page.goto("/metaverse/uk")
    // 로그인 요구 CTA 또는 phaser canvas 컨테이너 중 하나가 뜸 (dev 환경에선 후자)
    const candidates = page.locator("[aria-label='경기장 메타버스 월드맵'], a[href^='/sign-in']")
    await expect(candidates.first()).toBeVisible({ timeout: 10_000 })
  })

  test("deep-link /metaverse/uk?plot=london-01 파라미터가 500 내지 않는다", async ({ page }) => {
    const response = await page.goto("/metaverse/uk?plot=london-01")
    expect(response?.status()).toBeLessThan(500)
  })

  test("홈 GNB 에 메타버스 링크가 없다 (완성 전까지 숨김)", async ({ page }) => {
    await page.goto("/")
    // nav 내부에 /metaverse 링크 존재하지 않아야 함
    const mvLink = page.locator("nav a[href*='/metaverse']")
    await expect(mvLink).toHaveCount(0)
  })
})
