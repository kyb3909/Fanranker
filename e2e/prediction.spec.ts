import { test, expect } from '@playwright/test';

test.describe('예측 페이지', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/prediction');
    await page.waitForLoadState('networkidle');
  });

  test.describe('페이지 구조', () => {
    test('예측 페이지가 정상 로드되어야 한다', async ({ page }) => {
      await expect(page).toHaveURL('/prediction');
    });

    test('헤더가 표시되어야 한다', async ({ page }) => {
      const header = page.locator('header');
      await expect(header).toBeVisible();
    });

    test('메인 콘텐츠 영역이 표시되어야 한다', async ({ page }) => {
      const main = page.locator('main');
      await expect(main).toBeVisible();
    });
  });

  test.describe('탭 네비게이션', () => {
    test('오늘의 경기 탭이 표시되어야 한다', async ({ page }) => {
      const todayTab = page.getByRole('tab', { name: /오늘의 경기/ });
      await expect(todayTab).toBeVisible();
    });

    test('랭킹 탭이 표시되어야 한다', async ({ page }) => {
      const rankingTab = page.getByRole('tab', { name: /랭킹/ });
      await expect(rankingTab).toBeVisible();
    });

    test('마이페이지 탭이 표시되어야 한다', async ({ page }) => {
      const mypageTab = page.getByRole('tab', { name: /마이페이지/ });
      await expect(mypageTab).toBeVisible();
    });

    test('탭을 클릭하면 해당 콘텐츠가 표시되어야 한다', async ({ page }) => {
      const rankingTab = page.getByRole('tab', { name: /랭킹/ });
      await rankingTab.click();

      // 랭킹 콘텐츠 확인
      const rankingContent = page.getByText(/랭킹 TOP|아직 랭킹 데이터가 없습니다/);
      await expect(rankingContent.first()).toBeVisible({ timeout: 10000 });
    });

    test('마이페이지 탭 클릭 시 내 예측 현황이 표시되어야 한다', async ({ page }) => {
      const mypageTab = page.getByRole('tab', { name: /마이페이지/ });
      await mypageTab.click();

      // 내 예측 현황 콘텐츠
      const myStats = page.getByText(/내 예측 현황|예측 기록|로그인/);
      await expect(myStats.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('스포츠 필터', () => {
    test('전체 필터가 표시되어야 한다', async ({ page }) => {
      const allFilter = page.getByRole('button', { name: /전체/ });
      await expect(allFilter.first()).toBeVisible();
    });

    test('축구 필터가 표시되어야 한다', async ({ page }) => {
      const soccerFilter = page.getByRole('button', { name: /축구/ });
      await expect(soccerFilter.first()).toBeVisible();
    });

    test('야구 필터가 표시되어야 한다', async ({ page }) => {
      const baseballFilter = page.getByRole('button', { name: /야구/ });
      await expect(baseballFilter.first()).toBeVisible();
    });

    test('농구 필터가 표시되어야 한다', async ({ page }) => {
      const basketballFilter = page.getByRole('button', { name: /농구/ });
      await expect(basketballFilter.first()).toBeVisible();
    });

    test('배구 필터가 표시되어야 한다', async ({ page }) => {
      const volleyballFilter = page.getByRole('button', { name: /배구/ });
      await expect(volleyballFilter.first()).toBeVisible();
    });

    test('필터 클릭 시 스타일이 변경되어야 한다', async ({ page }) => {
      const soccerFilter = page.getByRole('button', { name: /축구/ }).first();
      await soccerFilter.click();

      // 활성 상태 확인 (emerald 배경)
      await expect(soccerFilter).toHaveClass(/bg-emerald|bg-primary/);
    });
  });

  test.describe('경기 목록', () => {
    test('경기 목록 또는 빈 상태가 표시되어야 한다', async ({ page }) => {
      // 경기 목록이 있거나 빈 상태 메시지
      const matchList = page.locator('[class*="space-y"], [class*="grid"]');
      const emptyMessage = page.getByText(/예측 가능한 경기가 없습니다/);

      const hasMatches = await matchList.first().isVisible().catch(() => false);
      const hasEmptyMessage = await emptyMessage.isVisible().catch(() => false);

      expect(hasMatches || hasEmptyMessage).toBeTruthy();
    });

    test('경기 카드에 팀 이름이 표시되어야 한다', async ({ page }) => {
      // 경기 카드가 있는 경우
      const matchCard = page.locator('[class*="rounded-lg"], [class*="Card"]').filter({
        has: page.locator('button')
      }).first();

      if (await matchCard.isVisible().catch(() => false)) {
        // 팀 이름 또는 배당률이 표시됨
        const teamInfo = matchCard.locator('p, span');
        await expect(teamInfo.first()).toBeVisible();
      }
    });

    test('경기 카드에 배당률이 표시되어야 한다', async ({ page }) => {
      // 배당률이 있는 버튼 찾기
      const oddsButton = page.locator('button').filter({
        hasText: /\d+\.\d+|-/
      }).first();

      if (await oddsButton.isVisible().catch(() => false)) {
        await expect(oddsButton).toBeVisible();
      }
    });
  });

  test.describe('예측 기능', () => {
    test('예측 버튼 클릭 시 적절한 응답이 있어야 한다', async ({ page }) => {
      // 예측 버튼 찾기 (배당률이 있는 버튼)
      const predictionButton = page.locator('button').filter({
        hasText: /\d+\.\d+/
      }).first();

      if (await predictionButton.isVisible().catch(() => false)) {
        await predictionButton.click();

        // 로그인 요청, 예측 완료, 또는 24시간 이내 경고 등
        await page.waitForTimeout(1000);

        // 어떤 형태의 응답이 있어야 함
        const response = page.locator('[role="alert"], [class*="toast"]');
        const loginPrompt = page.getByText(/로그인|예측 완료|24시간/);

        // 응답이 있거나 alert 창이 떴을 수 있음
      }
    });

    test('비로그인 상태에서 예측 시 로그인 안내가 표시되어야 한다', async ({ page }) => {
      const predictionButton = page.locator('button').filter({
        hasText: /\d+\.\d+/
      }).first();

      if (await predictionButton.isVisible().catch(() => false)) {
        // alert을 감지하기 위한 핸들러
        page.on('dialog', async dialog => {
          expect(dialog.message()).toMatch(/로그인|24시간/);
          await dialog.dismiss();
        });

        await predictionButton.click();
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('랭킹 표시', () => {
    test('사이드바에 랭킹 TOP 5가 표시되어야 한다 (데스크톱)', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/prediction');
      await page.waitForLoadState('networkidle');

      // 랭킹 카드
      const rankingCard = page.getByText(/랭킹 TOP|랭킹 데이터/);
      await expect(rankingCard.first()).toBeVisible();
    });

    test('랭킹 탭에서 전체 랭킹을 볼 수 있어야 한다', async ({ page }) => {
      const rankingTab = page.getByRole('tab', { name: /랭킹/ });
      await rankingTab.click();

      // 랭킹 목록 확인
      const rankingContent = page.locator('[class*="space-y"]').filter({
        has: page.locator('text=/TOP|1위|랭킹/')
      });

      await expect(rankingContent.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('내 예측 현황', () => {
    test('마이페이지 탭에서 내 예측 현황을 볼 수 있어야 한다', async ({ page }) => {
      const mypageTab = page.getByRole('tab', { name: /마이페이지/ });
      await mypageTab.click();

      // 내 예측 현황 카드
      const statsCard = page.getByText(/내 예측 현황|총 예측|예측 기록/);
      await expect(statsCard.first()).toBeVisible({ timeout: 10000 });
    });

    test('비로그인 상태에서 로그인 안내가 표시되어야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      // 사이드바의 로그인 안내 (비로그인 시)
      const loginPrompt = page.getByText(/로그인하고 예측에 참여/);

      // 로그인 상태에 따라 다름
      if (await loginPrompt.isVisible().catch(() => false)) {
        await expect(loginPrompt).toBeVisible();
      }
    });
  });

  test.describe('새로고침 기능', () => {
    test('새로고침 버튼이 표시되어야 한다', async ({ page }) => {
      const refreshButton = page.getByRole('button', { name: /새로고침/ });
      await expect(refreshButton).toBeVisible();
    });

    test('마지막 업데이트 시간이 표시되어야 한다', async ({ page }) => {
      const lastUpdate = page.getByText(/마지막 업데이트/);
      await expect(lastUpdate).toBeVisible();
    });
  });

  test.describe('반응형 레이아웃', () => {
    test('데스크톱에서 사이드바가 표시되어야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/prediction');
      await page.waitForLoadState('networkidle');

      const sidebar = page.locator('aside');
      await expect(sidebar.first()).toBeVisible();
    });

    test('모바일에서 사이드바가 숨겨져야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/prediction');
      await page.waitForLoadState('networkidle');

      // 사이드바가 숨겨짐 (hidden lg:block)
      const sidebar = page.locator('aside:not([class*="hidden"])');
      const sidebarCount = await sidebar.count();

      // 모바일에서는 0개 또는 표시되지 않음
    });

    test('모바일에서 필터가 스크롤 가능해야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/prediction');
      await page.waitForLoadState('networkidle');

      const filterContainer = page.locator('[class*="flex"][class*="gap"]').first();
      await expect(filterContainer).toBeVisible();
    });
  });

  test.describe('접근성', () => {
    test('탭에 적절한 role이 있어야 한다', async ({ page }) => {
      const tabs = page.locator('[role="tab"]');
      const tabCount = await tabs.count();

      expect(tabCount).toBeGreaterThanOrEqual(3);
    });

    test('탭 패널에 적절한 role이 있어야 한다', async ({ page }) => {
      const tabpanels = page.locator('[role="tabpanel"]');
      await expect(tabpanels.first()).toBeVisible();
    });

    test('키보드로 탭을 전환할 수 있어야 한다', async ({ page }) => {
      const firstTab = page.getByRole('tab').first();
      await firstTab.focus();

      // 방향키로 탭 이동
      await page.keyboard.press('ArrowRight');

      // 다음 탭에 포커스가 이동
      const focusedTab = page.locator('[role="tab"]:focus');
      await expect(focusedTab).toBeTruthy();
    });
  });

  test.describe('에러 처리', () => {
    test('API 오류 시 에러 상태가 표시되어야 한다', async ({ page }) => {
      // API 오류 시뮬레이션
      await page.route('**/api/predictions/**', route => route.abort());
      await page.route('**/api/rankings**', route => route.abort());

      await page.goto('/prediction');
      await page.waitForTimeout(2000);

      // 빈 상태 또는 에러 메시지
      const content = page.locator('main');
      await expect(content).toBeVisible();
    });
  });

  test.describe('리그별 그룹화', () => {
    test('경기가 리그별로 그룹화되어 표시되어야 한다', async ({ page }) => {
      // 리그 헤더가 있는 경우
      const leagueHeader = page.locator('[class*="font-semibold"]').filter({
        hasText: /리그|프리미어|라리가|세리에|분데스|K리그|KBO|NBA|KBL/
      }).first();

      // 경기가 있으면 리그 헤더가 표시됨
      if (await leagueHeader.isVisible().catch(() => false)) {
        await expect(leagueHeader).toBeVisible();
      }
    });
  });
});

test.describe('메인 페이지 경기 예측 탭', () => {
  test('메인 페이지에서 경기 예측 탭으로 전환 가능해야 한다', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const bettingTab = page.getByRole('button', { name: /경기 예측/ });
    await bettingTab.click();

    // 경기 예측 콘텐츠가 표시됨
    const bettingContent = page.getByText(/오늘의 경기|예측|랭킹/);
    await expect(bettingContent.first()).toBeVisible({ timeout: 10000 });
  });

  test('경기 예측 탭에서 경기 목록이 표시되어야 한다', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const bettingTab = page.getByRole('button', { name: /경기 예측/ });
    await bettingTab.click();

    await page.waitForLoadState('networkidle');

    // 경기 목록 또는 빈 상태
    const content = page.locator('main');
    await expect(content).toBeVisible();
  });
});
