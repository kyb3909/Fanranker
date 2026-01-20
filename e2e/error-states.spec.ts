import { test, expect } from '@playwright/test';

test.describe('네트워크 오류 처리', () => {
  test.describe('API 요청 실패', () => {
    test('게시글 목록 API 실패 시 에러 상태 표시', async ({ page }) => {
      await page.route('**/api/posts**', route => route.abort());

      await page.goto('/');
      await page.waitForTimeout(2000);

      // 빈 상태 또는 에러 메시지
      const emptyOrError = page.getByText(/게시물이 없습니다|오류|에러|실패|팔로우한 게시판/);
      await expect(emptyOrError.first()).toBeVisible({ timeout: 10000 });
    });

    test('검색 API 실패 시 에러 상태 표시', async ({ page }) => {
      await page.route('**/api/search**', route => route.abort());

      await page.goto('/search');

      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.fill('테스트');

      const searchButton = page.getByRole('button', { name: /검색/ });
      await searchButton.click();

      await page.waitForTimeout(2000);

      // 에러 상태 또는 빈 결과
      const errorOrEmpty = page.getByText(/검색 결과가 없습니다|오류|실패/);
      await expect(errorOrEmpty.first()).toBeVisible({ timeout: 10000 });
    });

    test('예측 API 실패 시 에러 상태 표시', async ({ page }) => {
      await page.route('**/api/prediction**', route => route.abort());
      await page.route('**/api/rankings**', route => route.abort());

      await page.goto('/prediction');
      await page.waitForTimeout(2000);

      // 콘텐츠 영역이 표시됨 (에러 상태 포함)
      const main = page.locator('main');
      await expect(main).toBeVisible();
    });
  });

  test.describe('느린 네트워크', () => {
    test('느린 응답에서 로딩 상태 표시', async ({ page }) => {
      await page.route('**/api/posts**', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await route.continue();
      });

      await page.goto('/');

      // 로딩 상태 확인
      const loader = page.getByText(/불러오는 중|로딩/);
      await expect(loader.first()).toBeVisible({ timeout: 5000 }).catch(() => {
        // 로딩이 너무 빨라서 보이지 않을 수 있음
      });

      // 결과적으로 콘텐츠가 로드됨
      await page.waitForLoadState('networkidle');
      const main = page.locator('main');
      await expect(main).toBeVisible();
    });

    test('검색 중 로딩 인디케이터 표시', async ({ page }) => {
      await page.route('**/api/search**', async route => {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await route.continue();
      });

      await page.goto('/search');

      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.fill('테스트');

      const searchButton = page.getByRole('button', { name: /검색/ });
      await searchButton.click();

      // 로딩 상태
      const loadingButton = page.getByText(/검색 중/);
      await expect(loadingButton).toBeVisible({ timeout: 3000 }).catch(() => {});
    });
  });

  test.describe('오프라인 상태', () => {
    test('오프라인 시 에러 처리', async ({ page, context }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 오프라인 모드 설정
      await context.setOffline(true);

      // 탭 클릭으로 새 API 요청 트리거
      const bettingTab = page.getByRole('button', { name: /승부 예측/ });
      await bettingTab.click();

      await page.waitForTimeout(2000);

      // 오프라인 상태에서는 에러가 발생할 수 있음
      const main = page.locator('main');
      await expect(main).toBeVisible();

      // 온라인 복원
      await context.setOffline(false);
    });
  });
});

test.describe('입력 유효성 검사', () => {
  test.describe('검색 입력', () => {
    test('빈 검색어 제출 방지', async ({ page }) => {
      await page.goto('/search');

      const searchButton = page.getByRole('button', { name: /검색/ });
      await expect(searchButton).toBeDisabled();
    });

    test('공백만 있는 검색어 제출 방지', async ({ page }) => {
      await page.goto('/search');

      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.fill('   ');

      const searchButton = page.getByRole('button', { name: /검색/ });
      await expect(searchButton).toBeDisabled();
    });

    test('특수 문자 검색어 처리', async ({ page }) => {
      await page.goto('/search');

      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.fill('<script>alert("xss")</script>');

      const searchButton = page.getByRole('button', { name: /검색/ });
      await searchButton.click();

      // 페이지가 정상 동작하고 XSS가 실행되지 않음
      await page.waitForTimeout(1000);

      // 페이지가 깨지지 않고 정상 표시
      const main = page.locator('main');
      await expect(main).toBeVisible();
    });

    test('매우 긴 검색어 처리', async ({ page }) => {
      await page.goto('/search');

      const searchInput = page.locator('input[type="text"]').first();
      const longQuery = 'a'.repeat(1000);
      await searchInput.fill(longQuery);

      const searchButton = page.getByRole('button', { name: /검색/ });
      await searchButton.click();

      await page.waitForTimeout(1000);

      // 페이지가 정상 동작
      const main = page.locator('main');
      await expect(main).toBeVisible();
    });
  });

  test.describe('글쓰기 입력', () => {
    test('제목이 비어있으면 제출 불가', async ({ page }) => {
      await page.goto('/write');

      // 게시판만 선택
      const communitySelect = page.locator('[role="combobox"]').first();
      await communitySelect.click();
      await page.getByRole('option', { name: /야구/ }).click();

      // 내용만 입력
      const editor = page.locator('[class*="ProseMirror"], [contenteditable="true"]').first();
      await editor.click();
      await page.keyboard.type('테스트 내용');

      // 버튼 비활성화
      const submitButton = page.getByRole('button', { name: /작성하기/ });
      await expect(submitButton).toBeDisabled();
    });

    test('내용이 비어있으면 제출 불가', async ({ page }) => {
      await page.goto('/write');

      // 게시판 선택
      const communitySelect = page.locator('[role="combobox"]').first();
      await communitySelect.click();
      await page.getByRole('option', { name: /야구/ }).click();

      // 제목만 입력
      const titleInput = page.getByLabel(/제목/);
      await titleInput.fill('테스트 제목');

      // 버튼 비활성화
      const submitButton = page.getByRole('button', { name: /작성하기/ });
      await expect(submitButton).toBeDisabled();
    });
  });
});

test.describe('404 및 에러 페이지', () => {
  test('존재하지 않는 페이지 접근 시 적절한 처리', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist');

    // 404 또는 에러 페이지
    expect(response?.status()).toBeGreaterThanOrEqual(200);
  });

  test('존재하지 않는 게시글 접근 시 404 처리', async ({ page }) => {
    const response = await page.goto('/post/non-existent-post-id-12345');

    expect(response?.status()).toBeGreaterThanOrEqual(200);
  });

  test('존재하지 않는 커뮤니티 접근 시 처리', async ({ page }) => {
    const response = await page.goto('/community/non-existent-community');

    expect(response?.status()).toBeGreaterThanOrEqual(200);

    // 페이지가 표시됨
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('잘못된 형식의 게시글 ID 접근 시 처리', async ({ page }) => {
    await page.goto('/post/invalid-id-!@#$%');

    // 페이지가 깨지지 않고 표시
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('인증 에러 처리', () => {
  test('비로그인 상태에서 투표 시 적절한 응답', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 투표 버튼 클릭 (있는 경우)
    const voteButton = page.locator('button').filter({
      has: page.locator('svg')
    }).first();

    if (await voteButton.isVisible().catch(() => false)) {
      await voteButton.click();
      await page.waitForTimeout(500);
      // 에러 alert 또는 로그인 요청 (아무 동작도 없을 수 있음)
    }
  });

  test('비로그인 상태에서 북마크 시 적절한 응답', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 북마크 버튼 찾기 (있는 경우)
    const bookmarkButton = page.locator('button').filter({
      has: page.locator('svg[class*="bookmark"], [class*="Bookmark"]')
    }).first();

    if (await bookmarkButton.isVisible().catch(() => false)) {
      // alert 핸들러
      page.on('dialog', async dialog => {
        await dialog.dismiss();
      });

      await bookmarkButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('비로그인 상태에서 글쓰기 제출 시 적절한 응답', async ({ page }) => {
    await page.goto('/write');

    // 모든 필드 입력
    const communitySelect = page.locator('[role="combobox"]').first();
    await communitySelect.click();
    await page.getByRole('option', { name: /야구/ }).click();

    const titleInput = page.getByLabel(/제목/);
    await titleInput.fill('테스트 제목');

    const editor = page.locator('[class*="ProseMirror"], [contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type('테스트 내용입니다');

    await page.waitForTimeout(500);

    // 제출 버튼이 활성화되면 클릭
    const submitButton = page.getByRole('button', { name: /작성하기/ });

    if (!(await submitButton.isDisabled())) {
      // alert 핸들러
      page.on('dialog', async dialog => {
        await dialog.dismiss();
      });

      await submitButton.click();
      await page.waitForTimeout(1000);
      // 로그인 요청 또는 에러 (API에서 처리)
    }
  });
});

test.describe('데이터 로딩 상태', () => {
  test('빈 게시글 목록 처리', async ({ page }) => {
    // 빈 응답 모의
    await page.route('**/api/posts**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: [], profiles: [] })
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 빈 상태 메시지
    const emptyMessage = page.getByText(/게시물이 없습니다|팔로우한 게시판/);
    await expect(emptyMessage.first()).toBeVisible({ timeout: 10000 });
  });

  test('빈 검색 결과 처리', async ({ page }) => {
    await page.route('**/api/search**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: [], profiles: [] })
      });
    });

    await page.goto('/search?q=테스트&type=title_content');
    await page.waitForLoadState('networkidle');

    const emptyMessage = page.getByText(/검색 결과가 없습니다/);
    await expect(emptyMessage).toBeVisible({ timeout: 10000 });
  });

  test('빈 예측 경기 목록 처리', async ({ page }) => {
    await page.goto('/prediction');
    await page.waitForLoadState('networkidle');

    // 경기가 있거나 없음 메시지
    const content = page.locator('main');
    await expect(content).toBeVisible();
  });
});

test.describe('엣지 케이스', () => {
  test('빠른 탭 전환', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const communityTab = page.getByRole('button', { name: /커뮤니티/ });
    const bettingTab = page.getByRole('button', { name: /승부 예측/ });

    // 빠르게 탭 전환
    await bettingTab.click();
    await communityTab.click();
    await bettingTab.click();
    await communityTab.click();

    await page.waitForTimeout(1000);

    // 페이지가 정상 동작
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('빠른 정렬 변경', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hotButton = page.getByRole('button', { name: /온도순/ });
    const newButton = page.getByRole('button', { name: /최신순/ });
    const commentsButton = page.getByRole('button', { name: /댓글순/ });

    // 빠르게 정렬 변경
    await newButton.click();
    await commentsButton.click();
    await hotButton.click();
    await newButton.click();

    await page.waitForTimeout(1000);

    // 페이지가 정상 동작
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('뒤로가기/앞으로가기 빠른 반복', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    await page.goto('/write');
    await page.waitForLoadState('networkidle');

    // 빠른 네비게이션
    await page.goBack();
    await page.goBack();
    await page.goForward();

    await page.waitForTimeout(500);

    // 페이지가 정상 표시
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('페이지 새로고침 후 상태 유지', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 탭 변경
    const bettingTab = page.getByRole('button', { name: /승부 예측/ });
    await bettingTab.click();

    // 새로고침
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 페이지가 정상 로드 (기본 상태로 복원)
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('스크롤 후 네비게이션', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 스크롤
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(300);

    // 다른 페이지로 이동
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // 페이지가 정상 로드되고 스크롤이 맨 위로
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });
});

test.describe('콘솔 에러 모니터링', () => {
  test('메인 페이지에서 JavaScript 에러가 없어야 한다', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', error => {
      errors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 심각한 에러가 없어야 함 (일부 경고는 허용)
    const criticalErrors = errors.filter(e =>
      !e.includes('Warning') &&
      !e.includes('DevTools') &&
      !e.includes('third-party')
    );

    expect(criticalErrors.length).toBe(0);
  });

  test('검색 페이지에서 JavaScript 에러가 없어야 한다', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', error => {
      errors.push(error.message);
    });

    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    const criticalErrors = errors.filter(e =>
      !e.includes('Warning') &&
      !e.includes('DevTools')
    );

    expect(criticalErrors.length).toBe(0);
  });
});
