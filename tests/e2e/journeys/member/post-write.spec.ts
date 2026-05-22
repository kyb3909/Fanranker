/**
 * [Member] 글 작성 — 4단계 검증.
 *   1) UI 액션: /write 에서 게시판·제목·본문 입력 후 작성하기
 *   2) UI 검증: 작성된 게시글 상세로 이동
 *   3) DB 검증: posts 에 본인 user_id + 제목 행 존재
 *   4) 부가 영향: 상세 페이지에 제목이 렌더링됨
 *
 * 각 실행마다 제목이 고유해 10회 반복·병렬에서도 DB 검증이 정확하다.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 글 작성 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)
    const title = `[E2E회원] 글작성 b${bot.index}-r${run}-${Date.now()}`

    await loginAs(page, bot)

    // 1) UI 액션
    await page.goto("/write")
    await page.getByRole("combobox", { name: "게시판 선택" }).click()
    await page.getByRole("option").first().click()

    await page.getByRole("textbox", { name: "제목" }).fill(title)

    const editor = page.locator('[contenteditable="true"]').first()
    await editor.click()
    await page.keyboard.type("E2E 회원 글 작성 저니 본문입니다.")

    await page.getByRole("button", { name: "작성하기" }).click()

    // 2) UI 검증: 게시글 상세로 이동
    await expect(page).toHaveURL(/\/post\/[0-9a-f-]+/, { timeout: 15_000 })
    const postId = page.url().split("/post/")[1].split(/[?#]/)[0]

    // 3) DB 검증: posts 행 존재
    const post = await expectDBRecord("posts", { id: postId })
    expect(post.user_id).toBe(bot.clerkUserId)
    expect(post.title).toBe(title)

    // 4) 부가 영향: 상세 페이지에 제목 렌더링
    await expect(page.getByText(title).first()).toBeVisible()

    await finishJourney(errors, testInfo)
  })
}
