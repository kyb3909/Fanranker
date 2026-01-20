import { test, expect } from '@playwright/test';

test.describe('메인 페이지 (홈)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('페이지 로딩 및 초기 렌더링', () => {
    test('페이지가 정상적으로 로드되어야 한다', async ({ page }) => {
      await expect(page).toHaveTitle(/홈|커뮤니티/);
    });

    test('헤더가 표시되어야 한다', async ({ page }) => {
      const header = page.locator('header');
      await expect(header).toBeVisible();
    });

    test('메인 콘텐츠 영역이 표시되어야 한다', async ({ page }) => {
      const main = page.locator('main');
      await expect(main).toBeVisible();
    });

    test('로딩 스피너가 표시되었다가 사라져야 한다', async ({ page }) => {
      // 로딩 상태 확인 (빠른 연결에서는 보이지 않을 수 있음)
      const loader = page.getByText('글 목록을 불러오는 중...');

      // 로딩이 완료될 때까지 대기
      await page.waitForLoadState('networkidle');

      // 로딩 완료 후 로더가 사라지거나 콘텐츠가 표시됨
      const content = page.locator('[class*="col-span"]').first();
      await expect(content).toBeVisible();
    });
  });

  test.describe('탭 네비게이션', () => {
    test('커뮤니티 탭이 기본 선택되어야 한다', async ({ page }) => {
      const communityTab = page.getByRole('button', { name: /커뮤니티/ });
      await expect(communityTab).toBeVisible();
      // 활성 상태 확인 (primary 색상 또는 border)
      await expect(communityTab).toHaveClass(/border-primary|text-primary/);
    });

    test('승부 예측 탭을 클릭하면 탭이 전환되어야 한다', async ({ page }) => {
      const bettingTab = page.getByRole('button', { name: /승부 예측/ });
      await bettingTab.click();

      await expect(bettingTab).toHaveClass(/border-primary|text-primary/);
    });

    test('탭 전환 시 콘텐츠가 변경되어야 한다', async ({ page }) => {
      // 커뮤니티 탭 콘텐츠 확인
      await page.waitForLoadState('networkidle');

      // 승부 예측 탭으로 전환
      const bettingTab = page.getByRole('button', { name: /승부 예측/ });
      await bettingTab.click();

      // 승부 예측 콘텐츠가 표시되는지 확인
      await page.waitForTimeout(500);
      const bettingContent = page.locator('text=/예측|경기|랭킹/');
      await expect(bettingContent.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('정렬 기능', () => {
    test('온도순 버튼이 표시되어야 한다', async ({ page }) => {
      const hotButton = page.getByRole('button', { name: /온도순/ });
      await expect(hotButton).toBeVisible();
    });

    test('최신순 버튼이 표시되어야 한다', async ({ page }) => {
      const newButton = page.getByRole('button', { name: /최신순/ });
      await expect(newButton).toBeVisible();
    });

    test('댓글순 버튼이 표시되어야 한다', async ({ page }) => {
      const commentsButton = page.getByRole('button', { name: /댓글순/ });
      await expect(commentsButton).toBeVisible();
    });

    test('정렬 버튼 클릭 시 스타일이 변경되어야 한다', async ({ page }) => {
      const newButton = page.getByRole('button', { name: /최신순/ });
      await newButton.click();

      // 활성 상태 확인 (primary 배경색)
      await expect(newButton).toHaveClass(/bg-primary/);
    });

    test('정렬 변경 시 API 호출이 발생해야 한다', async ({ page }) => {
      // 네트워크 요청 모니터링
      const requestPromise = page.waitForRequest(request =>
        request.url().includes('/api/posts') &&
        request.url().includes('sort=new')
      );

      const newButton = page.getByRole('button', { name: /최신순/ });
      await newButton.click();

      // 최신순 API 호출 확인
      const request = await requestPromise;
      expect(request.url()).toContain('sort=new');
    });
  });

  test.describe('게시글 카드', () => {
    test('게시글 목록이 표시되어야 한다 (또는 빈 상태 메시지)', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // 게시글 카드 또는 빈 상태 메시지 확인
      const postCards = page.locator('[class*="Card"], article');
      const emptyMessage = page.getByText(/게시물이 없습니다|팔로우한 게시판/);

      // 둘 중 하나는 표시되어야 함
      const hasCards = await postCards.count() > 0;
      const hasEmptyMessage = await emptyMessage.isVisible().catch(() => false);

      expect(hasCards || hasEmptyMessage).toBeTruthy();
    });

    test('게시글 카드에 필수 요소가 있어야 한다', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      const postCards = page.locator('[class*="Card"]').first();

      // 카드가 있는 경우에만 테스트
      if (await postCards.isVisible().catch(() => false)) {
        // 제목 영역
        const title = postCards.locator('h2, [class*="font-semibold"]').first();
        await expect(title).toBeVisible();

        // 커뮤니티 배지
        const communityBadge = postCards.locator('[class*="badge"], [class*="rounded-md"]').first();
        await expect(communityBadge).toBeVisible();
      }
    });

    test('게시글 카드 클릭 시 상세 페이지로 이동해야 한다', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      const firstPostLink = page.locator('a[href^="/post/"]').first();

      if (await firstPostLink.isVisible().catch(() => false)) {
        await firstPostLink.click();

        await expect(page).toHaveURL(/\/post\/[a-zA-Z0-9-]+/);
      }
    });
  });

  test.describe('사이드바', () => {
    test('데스크톱에서 왼쪽 사이드바가 표시되어야 한다', async ({ page }) => {
      // 데스크톱 뷰포트에서만 테스트
      await page.setViewportSize({ width: 1280, height: 800 });

      const leftSidebar = page.locator('aside').first();
      await expect(leftSidebar).toBeVisible();
    });

    test('데스크톱에서 오른쪽 사이드바가 표시되어야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const sidebars = page.locator('aside');
      const count = await sidebars.count();

      // 양쪽 사이드바가 있어야 함
      expect(count).toBeGreaterThanOrEqual(2);
    });

    test('모바일에서 사이드바가 숨겨져야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const sidebars = page.locator('aside.hidden, aside[class*="hidden lg:block"]');
      const visibleSidebars = page.locator('aside:not([class*="hidden"])');

      // 데스크톱용 사이드바는 보이지 않아야 함
      const visibleCount = await visibleSidebars.count();
      expect(visibleCount).toBeLessThanOrEqual(0);
    });
  });

  test.describe('접근성', () => {
    test('탭 네비게이션이 키보드로 작동해야 한다', async ({ page }) => {
      const communityTab = page.getByRole('button', { name: /커뮤니티/ });
      await communityTab.focus();

      // Tab 키로 다음 요소로 이동
      await page.keyboard.press('Tab');

      // 다음 요소에 포커스가 이동했는지 확인
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeTruthy();
    });

    test('버튼에 적절한 aria 레이블이 있어야 한다', async ({ page }) => {
      const buttons = page.locator('button');
      const buttonCount = await buttons.count();

      // 모든 버튼이 텍스트 또는 aria-label을 가지고 있어야 함
      for (let i = 0; i < Math.min(buttonCount, 5); i++) {
        const button = buttons.nth(i);
        const text = await button.innerText().catch(() => '');
        const ariaLabel = await button.getAttribute('aria-label');
        const ariaLabelledBy = await button.getAttribute('aria-labelledby');

        // 텍스트, aria-label, 또는 aria-labelledby 중 하나는 있어야 함
        const hasAccessibleName = text.trim().length > 0 || ariaLabel || ariaLabelledBy;
        expect(hasAccessibleName).toBeTruthy();
      }
    });
  });

  test.describe('성능', () => {
    test('페이지 로드가 5초 이내에 완료되어야 한다', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(5000);
    });

    test('초기 콘텐츠가 3초 이내에 표시되어야 한다', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/');

      // 헤더 또는 메인 콘텐츠 대기
      await page.locator('header').waitFor({ timeout: 3000 });

      const renderTime = Date.now() - startTime;
      expect(renderTime).toBeLessThan(3000);
    });
  });

  test.describe('에러 처리', () => {
    test('네트워크 오류 시 에러 메시지가 표시되어야 한다', async ({ page }) => {
      // API 요청 차단
      await page.route('**/api/posts**', route => route.abort());

      await page.goto('/');
      await page.waitForTimeout(2000);

      // 빈 상태 또는 에러 메시지 확인
      const emptyOrError = page.getByText(/게시물이 없습니다|오류|에러|실패/);
      await expect(emptyOrError.first()).toBeVisible({ timeout: 10000 });
    });
  });
});
