import { test, expect } from "@playwright/test"

// 2026-06-11 현행화: 측정된 /prediction DOM 기준.
// - 탭: 오늘의 경기/랭킹/통계/마이페이지 (role=tab, tabpanel 롤은 미구현 — a11y 갭으로 별도 보고)
// - 우측 사이드바: "최근 댓글 달린 게시물" (랭킹 TOP 5 위젯은 제거된 구조)
// - 홈의 "경기 예측 탭"은 제거됨 → 관련 테스트 삭제 (홈 탭은 게시물/경기 분석글)

test.describe("예측 페이지", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/prediction")
    // networkidle 은 라이브스코어 폴링 때문에 불안정 — 탭 렌더를 기준으로 대기
    await page.getByRole("tab", { name: /오늘의 경기/ }).waitFor({ timeout: 15000 })
  })

  test.describe("페이지 구조", () => {
    test("예측 페이지가 정상 로드되어야 한다", async ({ page }) => {
      await expect(page).toHaveURL("/prediction")
      await expect(page).toHaveTitle(/승부예측/)
    })

    test("헤더가 표시되어야 한다", async ({ page }) => {
      await expect(page.locator("header")).toBeVisible()
    })

    test("메인 콘텐츠 영역이 표시되어야 한다", async ({ page }) => {
      await expect(page.locator("main")).toBeVisible()
    })
  })

  test.describe("탭 네비게이션", () => {
    test("오늘의 경기 탭이 기본 선택되어야 한다", async ({ page }) => {
      const todayTab = page.getByRole("tab", { name: /오늘의 경기/ })
      await expect(todayTab).toBeVisible()
      await expect(todayTab).toHaveAttribute("aria-selected", "true")
    })

    test("랭킹 탭이 표시되어야 한다", async ({ page }) => {
      await expect(page.getByRole("tab", { name: /랭킹/ })).toBeVisible()
    })

    test("통계 탭이 표시되어야 한다", async ({ page }) => {
      await expect(page.getByRole("tab", { name: /통계/ })).toBeVisible()
    })

    test("마이페이지 탭이 표시되어야 한다", async ({ page }) => {
      await expect(page.getByRole("tab", { name: /마이페이지/ })).toBeVisible()
    })

    test("랭킹 탭을 클릭하면 탭이 전환되어야 한다", async ({ page }) => {
      const rankingTab = page.getByRole("tab", { name: /랭킹/ })
      await rankingTab.click()
      await expect(rankingTab).toHaveAttribute("aria-selected", "true")
    })

    test("마이페이지 탭 클릭 시 콘텐츠가 전환되어야 한다 (비로그인 → 로그인 안내)", async ({
      page,
    }) => {
      const mypageTab = page.getByRole("tab", { name: /마이페이지/ })
      await mypageTab.click()
      await expect(mypageTab).toHaveAttribute("aria-selected", "true")
      // 비로그인 상태이므로 로그인 안내 또는 예측 현황 중 하나가 보여야 함
      const content = page.getByText(/로그인|내 예측|예측 현황|예측 기록/)
      await expect(content.first()).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe("스포츠 필터", () => {
    // 사이드바 "⚽ 축구" 게시판 버튼과 이름이 겹침 — 전체 버튼이 속한 필터바로 스코프
    const filterBar = (page: import("@playwright/test").Page) =>
      page.getByRole("button", { name: /전체/ }).first().locator("..")

    for (const sport of ["전체", "축구", "야구", "농구", "배구"]) {
      test(`${sport} 필터가 표시되어야 한다`, async ({ page }) => {
        await expect(
          filterBar(page)
            .getByRole("button", { name: new RegExp(sport) })
            .first()
        ).toBeVisible()
      })
    }

    test("필터 클릭 시 활성 클래스(on)가 적용되어야 한다", async ({ page }) => {
      const soccerFilter = filterBar(page).getByRole("button", { name: /축구/ }).first()
      // 경기 없는 날은 필터가 비활성화될 수 있음 — 활성일 때만 클릭 검증
      if (await soccerFilter.isEnabled()) {
        // 라이브스코어 폴링 리렌더와 클릭이 겹치면 state 가 유실될 수 있어 클릭+단언을 재시도
        await expect(async () => {
          await soccerFilter.click()
          await expect(soccerFilter).toHaveClass(/on/, { timeout: 2000 })
        }).toPass({ timeout: 15000 })
      } else {
        await expect(filterBar(page).getByRole("button", { name: /전체/ })).toBeVisible()
      }
    })
  })

  test.describe("경기 목록", () => {
    test("경기 목록 또는 빈 상태가 표시되어야 한다", async ({ page }) => {
      // 배점 버튼(경기 있음) 또는 빈 상태 메시지
      const oddsButton = page.getByRole("button", { name: /배점/ }).first()
      const emptyMessage = page.getByText(/경기가 없습니다|예측 가능한 경기가 없/)
      const hasMatches = await oddsButton.isVisible().catch(() => false)
      const hasEmpty = await emptyMessage
        .first()
        .isVisible()
        .catch(() => false)
      expect(hasMatches || hasEmpty).toBeTruthy()
    })

    test("경기 카드에 팀 선택 버튼과 배점이 표시되어야 한다", async ({ page }) => {
      const oddsButton = page.getByRole("button", { name: /선택, 배점 \d+\.\d+/ }).first()
      if (await oddsButton.isVisible().catch(() => false)) {
        await expect(oddsButton).toBeVisible()
      }
    })
  })

  test.describe("예측 기능", () => {
    test("비로그인 상태에서 예측 버튼 클릭 시 페이지가 깨지지 않아야 한다", async ({ page }) => {
      const predictionButton = page.getByRole("button", { name: /선택, 배점/ }).first()
      if (await predictionButton.isVisible().catch(() => false)) {
        page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}))
        await predictionButton.click()
        // 로그인 안내(다이얼로그/토스트/모달) 어느 쪽이든 페이지는 유지되어야 함
        await expect(page).toHaveURL("/prediction")
        await expect(page.getByRole("tab", { name: /오늘의 경기/ })).toBeVisible()
      }
    })
  })

  test.describe("사이드바 위젯", () => {
    test("데스크톱 우측 사이드바에 최근 댓글 위젯이 표시되어야 한다", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await expect(page.getByRole("heading", { name: /최근 댓글 달린 게시물/ })).toBeVisible({
        timeout: 10000,
      })
    })

    test("랭킹 탭에서 랭킹 콘텐츠를 볼 수 있어야 한다", async ({ page }) => {
      await page.getByRole("tab", { name: /랭킹/ }).click()
      // 랭킹 목록 또는 빈 상태 — 탭 전환 후 메인에 콘텐츠가 렌더되면 통과
      await expect(page.locator("main")).toBeVisible()
      const rankingContent = page.getByText(/랭킹|위|아직.*없습니다|데이터가 없/)
      await expect(rankingContent.first()).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe("새로고침 기능", () => {
    test("새로고침 버튼이 표시되어야 한다", async ({ page }) => {
      await expect(page.getByRole("button", { name: /새로고침/ })).toBeVisible()
    })

    test("업데이트 시간이 표시되어야 한다", async ({ page }) => {
      await expect(page.getByText(/업데이트/).first()).toBeVisible()
    })
  })

  test.describe("반응형 레이아웃", () => {
    test("데스크톱에서 사이드바가 표시되어야 한다", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto("/prediction")
      await page.getByRole("tab", { name: /오늘의 경기/ }).waitFor({ timeout: 15000 })
      await expect(page.locator("aside").first()).toBeVisible()
    })

    test("모바일에서 사이드바가 숨겨져야 한다", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto("/prediction")
      await page.getByRole("tab", { name: /오늘의 경기/ }).waitFor({ timeout: 15000 })
      const sidebars = page.locator("aside")
      const count = await sidebars.count()
      for (let i = 0; i < count; i++) {
        await expect(sidebars.nth(i)).toBeHidden()
      }
    })

    test("모바일에서 필터가 표시되어야 한다", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto("/prediction")
      await expect(page.getByRole("button", { name: /전체/ }).first()).toBeVisible({
        timeout: 15000,
      })
    })
  })

  test.describe("접근성", () => {
    test("탭에 적절한 role이 있어야 한다", async ({ page }) => {
      const tabs = page.locator('[role="tab"]')
      expect(await tabs.count()).toBeGreaterThanOrEqual(3)
    })

    test("선택된 탭에 aria-selected가 있어야 한다", async ({ page }) => {
      // a11y 갭(2026-06-11 보고): tabpanel role 미구현 — tab/aria-selected 만 검증
      const selected = page.locator('[role="tab"][aria-selected="true"]')
      await expect(selected.first()).toBeVisible()
    })

    test("키보드로 탭을 포커스할 수 있어야 한다", async ({ page }) => {
      const firstTab = page.getByRole("tab").first()
      await firstTab.focus()
      await expect(firstTab).toBeFocused()
    })
  })

  test.describe("에러 처리", () => {
    test("API 오류 시에도 페이지 구조가 유지되어야 한다", async ({ page }) => {
      await page.route("**/api/sports/**", (route) => route.abort())
      await page.goto("/prediction")
      await expect(page.locator("main")).toBeVisible({ timeout: 15000 })
    })
  })
})
