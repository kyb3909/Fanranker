import { test, expect } from "@playwright/test"

test.describe("스타디움 페이지", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/stadium")
  })

  test("스타디움 페이지가 로드되어야 한다", async ({ page }) => {
    await expect(page.locator("text=England")).toBeVisible({ timeout: 10000 })
  })

  test("Wembley Stadium 마커가 표시되어야 한다", async ({ page }) => {
    const wembleyButton = page.getByText("Wembley Stadium")
    await expect(wembleyButton).toBeVisible({ timeout: 10000 })
  })

  test("Wembley 클릭 시 경기장 상세로 이동해야 한다", async ({ page }) => {
    const wembleyButton = page.getByText("Wembley Stadium").first()
    await wembleyButton.click()
    await page.waitForURL(/\/stadium\/epl_wembley/)
    await expect(page.getByText("잉글랜드")).toBeVisible()
  })

  test("비로그인 시 로그인 안내가 표시되어야 한다", async ({ page }) => {
    const wembleyButton = page.getByText("Wembley Stadium").first()
    await wembleyButton.click()
    await page.waitForURL(/\/stadium\/epl_wembley/)
    await expect(page.getByText("로그인하고 입장하기")).toBeVisible()
  })
})
