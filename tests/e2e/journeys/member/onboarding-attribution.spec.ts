/**
 * 온보딩 완료 → 유입 귀속 기록 (개막 이벤트 P0, 2026-08-10).
 *
 * ## 왜 이 저니가 필요한가
 * 개막 이벤트는 3채널에서 트래픽을 받는데, "어느 채널에서 온 사람이 가입까지
 * 갔는가"는 **소급이 안 되는 지표**다. 개막일에 안 쌓이면 그날 유입은 영원히
 * 출처 불명으로 남고, 언론사에 보여줄 숫자가 사라진다.
 *
 * 그런데 프로덕션 `user_acquisition` 은 도입(2026-07-29) 이후 **utm 이 채워진 행이
 * 0건**이다. 귀속 코드는 2026-08-08 감사에서 고쳐졌지만(`7081bd70`), 마지막 실제
 * 가입이 7/11 이라 **수리된 코드가 한 번도 실행된 적이 없다.** 빈 테이블은 고장의
 * 증거가 아니라 미검증의 증거였다. 게다가 온보딩을 다루는 e2e 저니가 하나도 없어
 * 이 경로 전체가 사각이었다.
 *
 * ## 무엇을 증명하는가
 * 귀속은 **온보딩 완료 핸들러 단 한 곳**에서만 발사된다
 * (`app/sign-up/[[...sign-up]]/page.tsx` step 4 → handleSubmit).
 * 이 저니는 그 경로를 끝까지 태워서 확인한다:
 *   ① 최초 터치 UTM 이 localStorage 에 고정되는가
 *   ② 완료 핸들러가 `POST /api/attribution` 을 실제로 쏘는가
 *   ③ 그 요청이 401 없이 통과하는가 (감사가 지목한 Clerk 세션 타이밍 위험)
 *   ④ DB 원장에 채널이 그대로 박히는가
 *
 * ⚠️ 프로덕션 가입 폼은 Clerk Smart CAPTCHA 로 봇을 막는다. 그래서 봇은 sign-in
 * ticket 으로 로그인한 뒤 온보딩만 수행한다 — 사람의 신규 가입과 다른 건 로그인
 * 수단뿐이고, 귀속을 쏘는 핸들러는 완전히 동일하다.
 *
 * 실행: `E2E_BOT_COUNT=1 pnpm test:e2e --grep "유입 귀속"`
 */
import { expect, test } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { loginAs } from "../../helpers/auth"
import { loadBots, type Bot } from "../../setup/bot-factory"

const UTM = {
  source: "e2e-verify",
  medium: "test",
  campaign: "preopen",
  content: "onboarding-attribution",
}

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

test.describe("온보딩 완료 → 유입 귀속", () => {
  // 가입 1회를 재현하는 저니라 반복·병렬이 의미 없다.
  test.describe.configure({ mode: "serial", retries: 0 })

  let bot: Bot

  test.beforeAll(async () => {
    bot = loadBots()[0]
    if (!bot) throw new Error("봇이 없다 — globalSetup 이 돌았는지 확인할 것")

    // 시드는 봇 프로필을 onboarding_completed=true 로 만든다. 온보딩 화면을 보려면
    // "가입 직후" 상태로 되돌려야 한다.
    //
    // ⚠️ 프로필을 **지우면 안 된다** — 시드가 같은 봇으로 게시글·골드를 만들어서
    // FK(user_gold_user_id_fkey 등)에 막힌다. 플래그만 내리면 충분하다:
    // sign-up 페이지는 `profile?.onboarding_completed === true` 일 때만 홈으로 튕긴다.
    await db().from("user_acquisition").delete().eq("user_id", bot.clerkUserId)
    const { error } = await db()
      .from("profiles")
      .update({ onboarding_completed: false })
      .eq("user_id", bot.clerkUserId)
    if (error) throw new Error(`온보딩 플래그 초기화 실패: ${error.message}`)
  })

  test.afterAll(async () => {
    if (!bot) return
    await db().from("user_acquisition").delete().eq("user_id", bot.clerkUserId)
    await db()
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("user_id", bot.clerkUserId)
  })

  test("UTM 을 달고 들어와 온보딩을 끝내면 귀속 원장에 채널이 남는다", async ({ page }) => {
    // /api/attribution 응답을 전부 기록 — 실패 시 401/429/500 을 눈으로 본다
    const attrResponses: string[] = []
    page.on("response", (r) => {
      if (r.url().includes("/api/attribution")) attrResponses.push(String(r.status()))
    })

    // ── ① UTM 을 달고 최초 착지 → AttributionTracker 가 localStorage 에 고정 ──
    const qs = new URLSearchParams({
      utm_source: UTM.source,
      utm_medium: UTM.medium,
      utm_campaign: UTM.campaign,
      utm_content: UTM.content,
    })
    await page.goto(`/?${qs}`)
    await page.waitForLoadState("domcontentloaded")

    const stored = await page.evaluate(() => window.localStorage.getItem("gn_attr_v1"))
    expect(stored, "최초 터치가 localStorage 에 고정되지 않았다 — 귀속의 출발점").toBeTruthy()
    expect(stored).toContain(UTM.source)

    // ── ② 로그인 (CAPTCHA 우회 — 온보딩 핸들러는 사람과 동일) ──
    await loginAs(page, bot)

    // ── ③ 온보딩. 로그인 상태라 계정생성(step 2)은 건너뛴다 ──
    await page.goto("/sign-up")
    await expect(page.getByRole("heading", { name: "약관 동의" })).toBeVisible({ timeout: 30_000 })

    // 필수 약관 전부 동의 (role=checkbox 인 커스텀 버튼)
    const boxes = page.getByRole("checkbox")
    const boxCount = await boxes.count()
    for (let i = 0; i < boxCount; i++) {
      const box = boxes.nth(i)
      if ((await box.getAttribute("aria-checked")) !== "true") await box.click()
    }
    await page.getByRole("button", { name: "다음" }).click()

    // 프로필 — 닉네임만 필수
    await expect(page.getByRole("heading", { name: "프로필 설정" })).toBeVisible()
    await page.getByPlaceholder("한글, 영문, 숫자 (2~20자)").fill(`귀속봇${Date.now() % 100000}`)
    await page.getByRole("button", { name: "다음" }).click()

    // 관심 게시판 — 1개 이상 선택해야 제출 버튼이 열린다
    await expect(page.getByRole("heading", { name: "관심 게시판 선택" })).toBeVisible()
    const chips = page.locator("div.flex.flex-wrap.gap-2 > button")
    await expect(chips.first()).toBeVisible({ timeout: 20_000 })
    await chips.first().click()

    // ── ④ 제출 = 귀속 발사 지점 ──
    const submit = page.getByRole("button", { name: "시작하기" })
    await expect(submit).toBeEnabled()
    await submit.click()

    // 홈으로 이동하면 handleSubmit 이 끝까지 갔다는 뜻
    await page.waitForURL(/\/$/, { timeout: 45_000 })

    // ── ⑤ 원장 확인 — fire-and-forget 이라 잠깐 기다린다 ──
    let row: Record<string, unknown> | null = null
    for (let i = 0; i < 20; i++) {
      const { data } = await db()
        .from("user_acquisition")
        .select("*")
        .eq("user_id", bot.clerkUserId)
        .maybeSingle()
      if (data?.utm_source) {
        row = data
        break
      }
      await page.waitForTimeout(1000)
    }

    expect(
      row,
      `귀속 행이 안 생겼다. /api/attribution 응답 코드: ` +
        `${attrResponses.join(", ") || "(호출 자체가 없음)"}\n` +
        `→ 개막일에 이러면 그날 유입 출처가 영원히 사라진다.`
    ).toBeTruthy()

    expect(row!.utm_source).toBe(UTM.source)
    expect(row!.utm_medium).toBe(UTM.medium)
    expect(row!.utm_campaign).toBe(UTM.campaign)
    // signup_at 은 오직 이 API 만 쓴다 — 비면 가입 단계가 퍼널에서 증발한다
    expect(row!.signup_at, "signup_at 이 비었다 — 퍼널에서 가입이 사라진다").toBeTruthy()
    expect(row!.landing_path, "착지 경로가 없다 — 랜딩별 전환 비교 불가").toBeTruthy()
  })
})
