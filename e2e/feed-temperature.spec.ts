import { test, expect } from "@playwright/test"

test.describe("온도순 피드", () => {
  test("홈에서 온도순 탭이 기본 선택되어야 한다", async ({ page }) => {
    await page.goto("/")
    const hotButton = page.getByRole("button", { name: "온도순" })
    await expect(hotButton).toBeVisible()
    await expect(hotButton).toHaveAttribute("aria-pressed", "true")
  })

  test("최신순 탭 클릭 시 피드가 전환되어야 한다", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const newButton = page.getByRole("button", { name: "최신순" })
    await newButton.click()

    // 최신순이 활성화
    await expect(newButton).toHaveAttribute("aria-pressed", "true")
  })

  test("피드 API가 온도순으로 정렬된 데이터를 반환해야 한다", async ({ request }) => {
    const res = await request.get("/api/posts?sort=hot&limit=10")
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.posts).toBeDefined()
    expect(Array.isArray(data.posts)).toBe(true)

    // 온도가 내림차순인지 확인
    if (data.posts.length >= 2) {
      for (let i = 0; i < data.posts.length - 1; i++) {
        const curr = data.posts[i].temperature ?? 0
        const next = data.posts[i + 1].temperature ?? 0
        expect(curr).toBeGreaterThanOrEqual(next)
      }
    }
  })

  test("피드 API가 최신순으로 정렬된 데이터를 반환해야 한다", async ({ request }) => {
    const res = await request.get("/api/posts?sort=new&limit=10")
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.posts).toBeDefined()

    // created_at이 내림차순인지 확인
    if (data.posts.length >= 2) {
      for (let i = 0; i < data.posts.length - 1; i++) {
        const curr = new Date(data.posts[i].created_at).getTime()
        const next = new Date(data.posts[i + 1].created_at).getTime()
        expect(curr).toBeGreaterThanOrEqual(next)
      }
    }
  })
})
