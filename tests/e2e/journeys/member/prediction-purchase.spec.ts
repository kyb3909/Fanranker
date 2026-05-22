/**
 * [Member] 예측 분석글 구매 — 4단계 검증.
 * 홈 "경기 분석글" 탭에서 기자/전문가의 유료 예측 콘텐츠를 구매 →
 * prediction_purchases 행 생성 (골드 500 차감).
 */
import { test, expect } from "@playwright/test"
import { loadBots } from "../../setup/bot-factory"
import { loginAs } from "../../helpers/auth"
import { collectErrors } from "../../helpers/error-collector"
import { expectDBRecord, dbClient } from "../../helpers/db-verifier"
import { finishJourney, REPEAT } from "../../helpers/journey"

const bots = loadBots()

for (let run = 1; run <= REPEAT; run++) {
  test(`[Member] 예측 분석글 구매 #${run}`, async ({ page }, testInfo) => {
    // 구매자는 판매자(bot04 기자)가 아니어야 함
    const picked = bots[testInfo.parallelIndex % bots.length]
    const buyer = picked.index === 4 ? bots[0] : picked
    const errors = collectErrors(page)

    // 클린 상태: 기존 구매 제거 (재구매 가능하게)
    await dbClient().from("prediction_purchases").delete().match({ buyer_id: buyer.clerkUserId })

    await loginAs(page, buyer)

    // 픽스처 재확립: content 탭은 팔로우한 유저의 활동만 노출한다. 차단 저니가
    // user_blocks INSERT 시 user_follows 를 양방향 삭제하므로, 동시 실행 중
    // 시드된 팔로우가 지워질 수 있다. 네비게이션 직전 구매자→판매자(bot04)
    // 팔로우를 다시 보장한다.
    const seller = bots.find((b) => b.index === 4)!
    await dbClient()
      .from("user_follows")
      .delete()
      .match({ follower_id: buyer.clerkUserId, followed_user_id: seller.clerkUserId })
    await dbClient()
      .from("user_follows")
      .insert({ follower_id: buyer.clerkUserId, followed_user_id: seller.clerkUserId })

    await page.goto("/?tab=content")

    // 1) UI 액션: 분석글 카드의 "열람" (구매) 버튼
    // content 탭은 /api/feed/predictions(쿼리 6개)를 호출 — 10워커 부하에서
    // 느려질 수 있어 넉넉히 대기한다.
    const buyBtn = page.getByRole("button", { name: /열람/ }).first()
    await buyBtn.waitFor({ timeout: 30_000 })
    await buyBtn.click()
    await page.waitForTimeout(1500)

    // 2~3) DB 검증: prediction_purchases 행 존재
    await expectDBRecord("prediction_purchases", { buyer_id: buyer.clerkUserId })

    await finishJourney(errors, testInfo)
  })
}
