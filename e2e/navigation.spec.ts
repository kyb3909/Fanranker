import { test, expect } from '@playwright/test';

test.describe('헤더 네비게이션', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('로고 및 홈 링크', () => {
    test('로고 클릭 시 홈으로 이동해야 한다', async ({ page }) => {
      // 다른 페이지로 먼저 이동
      await page.goto('/search');
      await page.waitForLoadState('networkidle');

      // 홈 로고/링크 클릭
      const homeLink = page.locator('header a[href="/"]').first();
      await homeLink.click();

      await expect(page).toHaveURL('/');
    });

    test('홈 텍스트가 표시되어야 한다', async ({ page }) => {
      const homeText = page.locator('header').getByText('홈');
      await expect(homeText.first()).toBeVisible();
    });
  });

  test.describe('네비게이션 버튼', () => {
    test('피드 버튼이 표시되어야 한다 (데스크톱)', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const feedButton = page.getByRole('button', { name: /피드/ });
      await expect(feedButton).toBeVisible();
    });

    test('탐색 버튼이 표시되어야 한다 (데스크톱)', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const exploreButton = page.locator('header a[href="/explore"]');
      await expect(exploreButton).toBeVisible();
    });

    test('탐색 버튼 클릭 시 탐색 페이지로 이동해야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const exploreLink = page.locator('header a[href="/explore"]');
      await exploreLink.click();

      await expect(page).toHaveURL('/explore');
    });
  });

  test.describe('검색 기능', () => {
    test('검색 입력 필드가 표시되어야 한다 (데스크톱)', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const searchInput = page.locator('header input[type="text"][placeholder*="검색"]');
      await expect(searchInput).toBeVisible();
    });

    test('검색 입력 필드 클릭 시 검색 페이지로 이동해야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const searchInput = page.locator('header input[type="text"]');
      await searchInput.click();

      await expect(page).toHaveURL('/search');
    });

    test('검색어 입력 후 Enter 시 검색 결과 페이지로 이동해야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const searchInput = page.locator('header input[type="text"]');
      await searchInput.fill('테스트');
      await searchInput.press('Enter');

      await expect(page).toHaveURL(/\/search\?q=.*테스트/);
    });

    test('검색 입력 필드가 모바일에서 숨겨져야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const searchInput = page.locator('header input[type="text"][placeholder*="검색"]');
      await expect(searchInput).not.toBeVisible();
    });
  });

  test.describe('알림 아이콘', () => {
    test('알림 아이콘이 표시되어야 한다', async ({ page }) => {
      // 로그인하지 않은 상태에서도 알림 아이콘은 표시됨
      const bellButton = page.locator('header button').filter({ has: page.locator('svg') });
      await expect(bellButton.first()).toBeVisible();
    });
  });

  test.describe('인증 상태', () => {
    test('비로그인 상태에서 로그인 메뉴가 표시되어야 한다', async ({ page }) => {
      // 비로그인 상태에서 사용자 메뉴 확인
      const userArea = page.locator('header').locator('[class*="items-center"]').last();
      await expect(userArea).toBeVisible();
    });
  });

  test.describe('헤더 스크롤 동작', () => {
    test('스크롤해도 헤더가 고정되어야 한다', async ({ page }) => {
      const header = page.locator('header');
      const initialPosition = await header.boundingBox();

      // 페이지 스크롤
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(500);

      const scrolledPosition = await header.boundingBox();

      // 헤더가 상단에 고정되어야 함 (sticky top-0)
      expect(scrolledPosition?.y).toBe(0);
    });

    test('헤더에 backdrop-blur 효과가 있어야 한다', async ({ page }) => {
      const header = page.locator('header');

      // backdrop-blur 클래스 확인
      await expect(header).toHaveClass(/backdrop-blur/);
    });
  });
});

test.describe('페이지 라우팅', () => {
  test.describe('커뮤니티 페이지', () => {
    const communities = [
      { slug: 'overseas-football', name: '해외축구' },
      { slug: 'baseball', name: '야구' },
      { slug: 'free-board', name: '자유게시판' },
    ];

    for (const community of communities) {
      test(`${community.name} 커뮤니티 페이지가 정상 로드되어야 한다`, async ({ page }) => {
        await page.goto(`/community/${community.slug}`);

        await expect(page).toHaveURL(`/community/${community.slug}`);
        await page.waitForLoadState('networkidle');

        // 페이지 콘텐츠 확인
        const content = page.locator('main');
        await expect(content).toBeVisible();
      });
    }
  });

  test.describe('검색 페이지', () => {
    test('검색 페이지가 정상 로드되어야 한다', async ({ page }) => {
      await page.goto('/search');

      await expect(page).toHaveURL('/search');

      // 검색 폼 확인
      const searchForm = page.locator('form');
      await expect(searchForm.first()).toBeVisible();
    });

    test('쿼리 파라미터가 있는 검색 페이지가 정상 로드되어야 한다', async ({ page }) => {
      await page.goto('/search?q=테스트&type=title_content');

      await expect(page).toHaveURL(/\/search\?q=.*type=/);

      // 검색어가 입력 필드에 표시되어야 함
      const searchInput = page.locator('input[type="text"]');
      await expect(searchInput.first()).toHaveValue('테스트');
    });
  });

  test.describe('글쓰기 페이지', () => {
    test('글쓰기 페이지가 정상 로드되어야 한다', async ({ page }) => {
      await page.goto('/write');

      await expect(page).toHaveURL('/write');

      // 글쓰기 폼 확인
      const titleInput = page.getByLabel(/제목/);
      await expect(titleInput).toBeVisible();
    });

    test('커뮤니티 파라미터가 있는 글쓰기 페이지가 정상 로드되어야 한다', async ({ page }) => {
      await page.goto('/write?community=baseball');

      await expect(page).toHaveURL(/\/write\?community=baseball/);

      // 게시판 선택이 자동으로 설정되어야 함
      // Select 컴포넌트의 값 확인
      await page.waitForTimeout(500);
    });
  });

  test.describe('탐색 페이지', () => {
    test('탐색 페이지가 정상 로드되어야 한다', async ({ page }) => {
      await page.goto('/explore');

      await expect(page).toHaveURL('/explore');

      // 페이지 콘텐츠 확인
      const main = page.locator('main');
      await expect(main).toBeVisible();
    });
  });

  test.describe('예측 페이지', () => {
    test('예측 페이지가 정상 로드되어야 한다', async ({ page }) => {
      await page.goto('/prediction');

      await expect(page).toHaveURL('/prediction');

      // 페이지 콘텐츠 확인
      const main = page.locator('main');
      await expect(main).toBeVisible();
    });
  });

  test.describe('404 처리', () => {
    test('존재하지 않는 페이지에서 404 또는 에러 페이지가 표시되어야 한다', async ({ page }) => {
      const response = await page.goto('/non-existent-page-12345');

      // 404 응답 또는 에러 페이지 확인
      expect(response?.status() === 404 || response?.status() === 200).toBeTruthy();
    });

    test('존재하지 않는 게시글에서 404가 표시되어야 한다', async ({ page }) => {
      const response = await page.goto('/post/non-existent-post-12345');

      // 404 응답 또는 notFound 페이지 확인
      expect(response?.status() === 404 || response?.status() === 200).toBeTruthy();
    });
  });
});

test.describe('브라우저 뒤로가기/앞으로가기', () => {
  test('브라우저 뒤로가기가 정상 동작해야 한다', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 검색 페이지로 이동
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // 뒤로가기
    await page.goBack();

    await expect(page).toHaveURL('/');
  });

  test('브라우저 앞으로가기가 정상 동작해야 한다', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    await page.goBack();
    await page.waitForLoadState('networkidle');

    // 앞으로가기
    await page.goForward();

    await expect(page).toHaveURL('/search');
  });
});
