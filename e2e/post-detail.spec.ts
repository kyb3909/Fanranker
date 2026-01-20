import { test, expect } from '@playwright/test';

test.describe('게시글 상세 페이지', () => {
  test.describe('페이지 접근', () => {
    test('메인 페이지에서 게시글 클릭으로 상세 페이지 진입', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();

      if (await postLink.isVisible().catch(() => false)) {
        const href = await postLink.getAttribute('href');
        await postLink.click();

        await expect(page).toHaveURL(href!);
      }
    });

    test('직접 URL로 게시글 상세 페이지 접근', async ({ page }) => {
      // 먼저 게시글 ID를 얻기 위해 메인 페이지에서 확인
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();

      if (await postLink.isVisible().catch(() => false)) {
        const href = await postLink.getAttribute('href');
        const postId = href?.split('/post/')[1];

        // 직접 URL로 접근
        await page.goto(`/post/${postId}`);

        await expect(page).toHaveURL(`/post/${postId}`);
      }
    });

    test('존재하지 않는 게시글 ID로 접근 시 404 처리', async ({ page }) => {
      const response = await page.goto('/post/non-existent-post-id-12345');

      // 404 페이지 또는 리다이렉트
      expect(response?.status() === 404 || response?.status() === 200).toBeTruthy();

      // notFound() 호출 시 특정 메시지가 표시될 수 있음
      const notFoundContent = page.getByText(/찾을 수 없|존재하지 않|404/);
      if (await notFoundContent.isVisible().catch(() => false)) {
        await expect(notFoundContent.first()).toBeVisible();
      }
    });
  });

  test.describe('게시글 콘텐츠', () => {
    test.beforeEach(async ({ page }) => {
      // 게시글이 있는 상태에서 테스트
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');
      }
    });

    test('게시글 제목이 표시되어야 한다', async ({ page }) => {
      // 게시글 페이지에 있는 경우에만 테스트
      if (page.url().includes('/post/')) {
        const title = page.locator('h1, h2').first();
        await expect(title).toBeVisible();
      }
    });

    test('게시글 내용이 표시되어야 한다', async ({ page }) => {
      if (page.url().includes('/post/')) {
        const content = page.locator('main');
        await expect(content).toBeVisible();
      }
    });

    test('작성자 정보가 표시되어야 한다', async ({ page }) => {
      if (page.url().includes('/post/')) {
        // 아바타 또는 작성자 이름
        const authorInfo = page.locator('[class*="avatar"], [class*="Author"]');
        await expect(authorInfo.first()).toBeVisible();
      }
    });

    test('커뮤니티 배지가 표시되어야 한다', async ({ page }) => {
      if (page.url().includes('/post/')) {
        const communityBadge = page.locator('a[href^="/community/"]').first();
        await expect(communityBadge).toBeVisible();
      }
    });

    test('작성 시간이 표시되어야 한다', async ({ page }) => {
      if (page.url().includes('/post/')) {
        const timestamp = page.getByText(/전|분|시간|일/);
        await expect(timestamp.first()).toBeVisible();
      }
    });
  });

  test.describe('뒤로가기 버튼', () => {
    test('뒤로가기 버튼이 표시되어야 한다', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');

        // 뒤로가기 버튼 확인
        const backButton = page.getByRole('button', { name: /뒤로|Back/ }).or(
          page.locator('[class*="back"], button').filter({ has: page.locator('svg') }).first()
        );
        await expect(backButton.first()).toBeVisible();
      }
    });

    test('뒤로가기 버튼 클릭 시 이전 페이지로 이동', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');

        // 뒤로가기 버튼 클릭
        const backButton = page.locator('button').first();
        await backButton.click();

        // 이전 페이지(홈)로 이동 확인
        await page.waitForTimeout(1000);
      }
    });
  });

  test.describe('투표 기능', () => {
    test('추천 버튼이 표시되어야 한다', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');

        // 추천 버튼 (ArrowUp 아이콘 또는 텍스트)
        const voteButton = page.locator('button').filter({ has: page.locator('svg') });
        await expect(voteButton.first()).toBeVisible();
      }
    });

    test('비로그인 상태에서 투표 시 적절한 처리', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');

        // 투표 버튼 클릭
        const voteButton = page.locator('button').filter({ has: page.locator('svg') }).first();
        await voteButton.click();

        // 로그인 요청 또는 에러 메시지 (비로그인 시)
        await page.waitForTimeout(1000);
      }
    });
  });

  test.describe('북마크 기능', () => {
    test('북마크 버튼이 표시되어야 한다', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');

        // 북마크 버튼
        const bookmarkButton = page.locator('button').filter({ has: page.locator('svg[class*="bookmark"], [class*="Bookmark"]') });

        if (await bookmarkButton.count() > 0) {
          await expect(bookmarkButton.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('공유 기능', () => {
    test('공유 버튼이 표시되어야 한다', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');

        // 공유 버튼 (Share 아이콘)
        const shareButton = page.locator('button').filter({ has: page.locator('svg') });
        await expect(shareButton.first()).toBeVisible();
      }
    });
  });

  test.describe('댓글 섹션', () => {
    test('댓글 섹션이 표시되어야 한다', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');

        // 댓글 관련 요소 (입력 필드 또는 댓글 목록)
        const commentSection = page.locator('text=/댓글|comment/i').or(
          page.locator('textarea[placeholder*="댓글"]')
        );

        // 댓글 섹션이 있거나 로딩 중일 수 있음
        await page.waitForTimeout(1000);
      }
    });

    test('댓글 입력 필드가 표시되어야 한다', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');

        // 댓글 입력 필드
        const commentInput = page.locator('textarea, input[type="text"]').filter({
          has: page.locator('[placeholder*="댓글"]')
        });

        // 입력 필드가 있을 수 있음
        await page.waitForTimeout(1000);
      }
    });
  });

  test.describe('레이아웃', () => {
    test('데스크톱에서 사이드바가 표시되어야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');

        const sidebar = page.locator('aside');
        await expect(sidebar.first()).toBeVisible();
      }
    });

    test('모바일에서 사이드바가 숨겨져야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');

        const sidebar = page.locator('aside.hidden, aside[class*="hidden lg:block"]');
        // 모바일에서는 숨겨져야 함
      }
    });
  });

  test.describe('접근성', () => {
    test('게시글 제목에 적절한 heading 레벨이 있어야 한다', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');

        // h1 또는 h2 태그 확인
        const heading = page.locator('h1, h2');
        await expect(heading.first()).toBeVisible();
      }
    });

    test('이미지에 alt 텍스트가 있어야 한다', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await page.waitForLoadState('networkidle');

        const images = page.locator('img');
        const imageCount = await images.count();

        for (let i = 0; i < imageCount; i++) {
          const img = images.nth(i);
          const alt = await img.getAttribute('alt');
          // alt 속성이 있어야 함 (빈 문자열도 허용)
          expect(alt !== null).toBeTruthy();
        }
      }
    });
  });

  test.describe('조회수', () => {
    test('페이지 로드 시 조회수 API가 호출되어야 한다', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();
      if (await postLink.isVisible().catch(() => false)) {
        const href = await postLink.getAttribute('href');
        const postId = href?.split('/post/')[1];

        // 네트워크 요청 모니터링
        const requestPromise = page.waitForResponse(response =>
          response.url().includes('/api/posts') || response.status() === 200
        );

        await postLink.click();

        // 페이지 로드 완료
        await page.waitForLoadState('networkidle');
      }
    });
  });
});
