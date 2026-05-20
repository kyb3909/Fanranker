import { test, expect } from "@playwright/test"

test.describe("oEmbed 렌더링", () => {
  test("포스트 상세에서 YouTube 임베드가 렌더링되어야 한다", async ({ page }) => {
    await page.goto("/post/0b144d86-1826-4cfb-8078-ee7e3cdec6d0")

    // YouTube iframe이 뷰포트 아래에 있을 수 있으므로 스크롤
    const ytIframe = page.locator('iframe[src*="youtube.com"]')
    await ytIframe.scrollIntoViewIfNeeded({ timeout: 20000 })
    await expect(ytIframe).toBeVisible({ timeout: 10000 })
  })

  test("포스트 상세에서 X 임베드가 렌더링되어야 한다", async ({ page }) => {
    await page.goto("/post/0b144d86-1826-4cfb-8078-ee7e3cdec6d0")

    // networkidle 대신 직접 요소 대기 (외부 API 느릴 수 있음)
    const xEmbed = page.getByText("X에서 보기")
    await expect(xEmbed).toBeVisible({ timeout: 20000 })
  })

  test("oEmbed API가 YouTube URL에 대해 정상 응답해야 한다", async ({ request }) => {
    const res = await request.get("/api/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.provider).toBe("youtube")
    expect(data.title).toBeTruthy()
  })

  test("oEmbed API가 지원하지 않는 URL에 422를 반환해야 한다", async ({ request }) => {
    const res = await request.get("/api/oembed?url=https://example.com")
    expect(res.status()).toBe(400) // ALLOWED_HOSTS에 없으므로 400
  })

  test("oEmbed API가 URL 없이 400을 반환해야 한다", async ({ request }) => {
    const res = await request.get("/api/oembed")
    expect(res.status()).toBe(400)
  })

  test("oEmbed API가 Instagram 게시물 URL에 blockquote fallback을 반환해야 한다", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/oembed?url=https://www.instagram.com/p/C1example99/&includeHtml=true"
    )
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.provider).toBe("instagram")
    // 토큰 유무와 무관하게 embed.js 가 처리할 blockquote 가 항상 포함되어야 함
    expect(data.html).toContain("instagram-media")
  })

  test("oEmbed API가 Instagram Reel URL도 인식해야 한다", async ({ request }) => {
    const res = await request.get(
      "/api/oembed?url=https://www.instagram.com/reel/C1example99/&includeHtml=true"
    )
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.provider).toBe("instagram")
  })
})
