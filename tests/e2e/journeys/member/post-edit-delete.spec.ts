/**
 * [Member] 글 수정 / 글 삭제 — 더보기 메뉴 경유, 4단계 검증.
 * 본인 글만 수정·삭제 가능하므로 픽스처 게시글은 해당 봇 소유로 생성한다.
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord, getDBRecords } from "../../helpers/db-verifier"
import { createPost } from "../../helpers/fixtures"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 글 수정 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)
    const postId = await createPost(bot, `[E2E픽스처] 수정전 b${bot.index}-r${run}-${Date.now()}`)
    const newTitle = `[E2E회원] 수정후 b${bot.index}-r${run}-${Date.now()}`

    await loginAs(page, bot)
    await page.goto(`/post/${postId}`)

    // 1) UI 액션: 더보기 → 게시글 수정 → 제목 변경 → 제출
    await page.getByRole("button", { name: "더보기 메뉴" }).click()
    await page.getByRole("menuitem", { name: /수정/ }).click()
    await expect(page).toHaveURL(/\/write/)

    await page.getByRole("textbox", { name: "제목" }).fill(newTitle)
    await page.getByRole("button", { name: /수정하기|작성하기/ }).click()

    // 2) UI 검증: 게시글 상세로 복귀
    await expect(page).toHaveURL(new RegExp(`/post/${postId}`), { timeout: 15_000 })

    // 3) DB 검증: 제목 변경됨
    await expectDBRecord("posts", { id: postId, title: newTitle })

    await finishJourney(errors, testInfo)
  })

  test(`[Member] 글 삭제 #${run}`, async ({ page }, testInfo) => {
    const bot = bots[testInfo.parallelIndex % bots.length]
    const errors = collectErrors(page)
    const postId = await createPost(bot, `[E2E픽스처] 삭제대상 b${bot.index}-r${run}-${Date.now()}`)

    // 네이티브 confirm 다이얼로그가 뜨면 수락
    page.on("dialog", (d) => d.accept())

    await loginAs(page, bot)
    await page.goto(`/post/${postId}`)

    // 1) UI 액션: 더보기 → 게시글 삭제 (네이티브 confirm 은 위 dialog 핸들러가 수락)
    await page.getByRole("button", { name: "더보기 메뉴" }).click()
    await page.getByRole("menuitem", { name: /삭제/ }).click()

    // 2~3) DB 검증: soft delete — deleted_at 설정될 때까지 폴링
    let deleted = false
    for (let i = 0; i < 30 && !deleted; i++) {
      const rows = await getDBRecords("posts", { id: postId })
      if (rows.length === 1 && rows[0].deleted_at != null) deleted = true
      else await new Promise((r) => setTimeout(r, 300))
    }
    expect(deleted, "soft delete 의 deleted_at 이 설정되지 않음").toBe(true)

    await finishJourney(errors, testInfo)
  })
}
