/**
 * [Guest] 게시글 상세 열람 — 시드 게시글의 상세 페이지를 연다.
 * 게시글 id 는 로컬 DB 에서 조회해 진입점이 결정적이다.
 */
import { test, expect } from "@playwright/test"
import { collectErrors } from "../../helpers/error-collector"
import { getDBRecords } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

for (let run = 1; run <= REPEAT; run++) {
  test(`[Guest] 게시글 상세 열람 #${run}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page)

    const posts = await getDBRecords("posts", { community_slug: "football" })
    expect(posts.length).toBeGreaterThan(0)
    const postId = posts[0].id as string

    await page.goto(`/post/${postId}`)
    await expect(page).toHaveURL(new RegExp(`/post/${postId}`))
    await expect(page.getByRole("heading").first()).toBeVisible()
    // 시드 본문이 렌더링되는지 확인
    await expect(page.getByText("축구 게시판 시드").first()).toBeVisible()

    await finishJourney(errors, testInfo)
  })
}
