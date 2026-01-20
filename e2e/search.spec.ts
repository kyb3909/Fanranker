import { test, expect } from '@playwright/test';

test.describe('검색 페이지', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/search');
  });

  test.describe('페이지 구조', () => {
    test('검색 페이지가 정상 로드되어야 한다', async ({ page }) => {
      await expect(page).toHaveTitle(/검색|커뮤니티/);
    });

    test('검색 헤더가 표시되어야 한다', async ({ page }) => {
      const header = page.getByRole('heading', { name: /검색/ });
      await expect(header).toBeVisible();
    });

    test('검색 입력 필드가 표시되어야 한다', async ({ page }) => {
      const searchInput = page.locator('input[type="text"]').first();
      await expect(searchInput).toBeVisible();
    });

    test('검색 버튼이 표시되어야 한다', async ({ page }) => {
      const searchButton = page.getByRole('button', { name: /검색/ });
      await expect(searchButton).toBeVisible();
    });

    test('검색 타입 선택기가 표시되어야 한다', async ({ page }) => {
      // Select 컴포넌트 확인
      const selectTrigger = page.locator('[role="combobox"], [class*="SelectTrigger"]');
      await expect(selectTrigger.first()).toBeVisible();
    });
  });

  test.describe('검색 타입 선택', () => {
    test('기본 검색 타입이 "제목 + 내용"이어야 한다', async ({ page }) => {
      const selectValue = page.getByText(/제목 \+ 내용/);
      await expect(selectValue.first()).toBeVisible();
    });

    test('검색 타입을 변경할 수 있어야 한다', async ({ page }) => {
      // Select 트리거 클릭
      const selectTrigger = page.locator('[role="combobox"], button').filter({ hasText: /제목|닉네임|ID/ }).first();
      await selectTrigger.click();

      // 옵션 선택
      const nicknameOption = page.getByRole('option', { name: /닉네임/ });
      await nicknameOption.click();

      // 선택된 값 확인
      await expect(page.getByText(/닉네임/).first()).toBeVisible();
    });

    test('모든 검색 타입 옵션이 존재해야 한다', async ({ page }) => {
      const selectTrigger = page.locator('[role="combobox"], button').filter({ hasText: /제목|닉네임|ID/ }).first();
      await selectTrigger.click();

      // 각 옵션 확인
      await expect(page.getByRole('option', { name: /제목 \+ 내용/ })).toBeVisible();
      await expect(page.getByRole('option', { name: /^제목$/ })).toBeVisible();
      await expect(page.getByRole('option', { name: /닉네임/ })).toBeVisible();
      await expect(page.getByRole('option', { name: /ID/ })).toBeVisible();
    });
  });

  test.describe('검색 실행', () => {
    test('검색어 입력 후 검색 버튼 클릭으로 검색이 실행되어야 한다', async ({ page }) => {
      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.fill('테스트 검색어');

      const searchButton = page.getByRole('button', { name: /검색/ });
      await searchButton.click();

      // URL에 쿼리 파라미터 확인
      await expect(page).toHaveURL(/q=.*테스트/);
    });

    test('검색어 입력 후 Enter 키로 검색이 실행되어야 한다', async ({ page }) => {
      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.fill('엔터 검색');
      await searchInput.press('Enter');

      // URL에 쿼리 파라미터 확인
      await expect(page).toHaveURL(/q=.*엔터/);
    });

    test('빈 검색어로는 검색되지 않아야 한다', async ({ page }) => {
      const searchButton = page.getByRole('button', { name: /검색/ });

      // 비활성화 확인 또는 클릭해도 변화 없음
      await expect(searchButton).toBeDisabled();
    });

    test('공백만 있는 검색어로는 검색되지 않아야 한다', async ({ page }) => {
      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.fill('   ');

      const searchButton = page.getByRole('button', { name: /검색/ });
      await expect(searchButton).toBeDisabled();
    });
  });

  test.describe('검색 결과', () => {
    test('검색 결과가 있을 때 결과 개수가 표시되어야 한다', async ({ page }) => {
      // 검색 실행
      await page.goto('/search?q=테스트&type=title_content');
      await page.waitForLoadState('networkidle');

      // 결과가 있거나 없음 메시지가 표시됨
      const resultCount = page.getByText(/검색 결과:.*개/);
      const noResult = page.getByText(/검색 결과가 없습니다/);

      // 둘 중 하나는 표시되어야 함
      const hasResultCount = await resultCount.isVisible().catch(() => false);
      const hasNoResult = await noResult.isVisible().catch(() => false);

      expect(hasResultCount || hasNoResult).toBeTruthy();
    });

    test('검색 결과가 없을 때 안내 메시지가 표시되어야 한다', async ({ page }) => {
      // 존재하지 않을 검색어로 검색
      await page.goto('/search?q=asdfghjklzxcvbnm12345&type=title_content');
      await page.waitForLoadState('networkidle');

      const noResultMessage = page.getByText(/검색 결과가 없습니다|다른 검색어/);
      await expect(noResultMessage.first()).toBeVisible({ timeout: 10000 });
    });

    test('검색 전 초기 상태 메시지가 표시되어야 한다', async ({ page }) => {
      const initialMessage = page.getByText(/검색어를 입력/);
      await expect(initialMessage).toBeVisible();
    });
  });

  test.describe('검색 결과 카드', () => {
    test('검색 결과 카드에 제목이 표시되어야 한다', async ({ page }) => {
      // 결과가 있는 검색 수행 (모의 또는 실제 데이터)
      await page.goto('/search?q=테스트&type=title_content');
      await page.waitForLoadState('networkidle');

      const postCards = page.locator('[class*="Card"]');

      // 카드가 있으면 제목 확인
      if (await postCards.count() > 0) {
        const firstCard = postCards.first();
        const title = firstCard.locator('h2, [class*="font-semibold"]');
        await expect(title.first()).toBeVisible();
      }
    });

    test('검색 결과 카드 클릭 시 해당 게시글로 이동해야 한다', async ({ page }) => {
      await page.goto('/search?q=테스트&type=title_content');
      await page.waitForLoadState('networkidle');

      const postLink = page.locator('a[href^="/post/"]').first();

      if (await postLink.isVisible().catch(() => false)) {
        await postLink.click();
        await expect(page).toHaveURL(/\/post\//);
      }
    });
  });

  test.describe('로딩 상태', () => {
    test('검색 중 로딩 인디케이터가 표시되어야 한다', async ({ page }) => {
      // 네트워크 지연 시뮬레이션
      await page.route('**/api/search**', async route => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.continue();
      });

      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.fill('테스트');

      const searchButton = page.getByRole('button', { name: /검색/ });
      await searchButton.click();

      // 로딩 상태 확인
      const loader = page.getByText(/검색 중/);
      await expect(loader).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('URL 상태 관리', () => {
    test('검색 파라미터가 URL에 반영되어야 한다', async ({ page }) => {
      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.fill('URL 테스트');

      const searchButton = page.getByRole('button', { name: /검색/ });
      await searchButton.click();

      await expect(page).toHaveURL(/q=.*URL/);
      await expect(page).toHaveURL(/type=title_content/);
    });

    test('URL 파라미터로 페이지 로드 시 검색이 자동 실행되어야 한다', async ({ page }) => {
      await page.goto('/search?q=자동검색&type=nickname');
      await page.waitForLoadState('networkidle');

      // 검색어가 입력 필드에 표시됨
      const searchInput = page.locator('input[type="text"]').first();
      await expect(searchInput).toHaveValue('자동검색');

      // 검색이 실행됨 (결과 또는 빈 결과 메시지)
      const hasSearched = page.locator('text=/검색 결과:|검색 결과가 없습니다/');
      await expect(hasSearched.first()).toBeVisible({ timeout: 10000 });
    });

    test('브라우저 뒤로가기 시 이전 검색 상태가 복원되어야 한다', async ({ page }) => {
      // 첫 번째 검색
      await page.goto('/search?q=첫번째&type=title_content');
      await page.waitForLoadState('networkidle');

      // 두 번째 검색
      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.fill('두번째');
      const searchButton = page.getByRole('button', { name: /검색/ });
      await searchButton.click();
      await page.waitForLoadState('networkidle');

      // 뒤로가기
      await page.goBack();
      await page.waitForLoadState('networkidle');

      // URL 확인
      await expect(page).toHaveURL(/q=.*첫번째/);
    });
  });

  test.describe('접근성', () => {
    test('검색 입력 필드에 적절한 placeholder가 있어야 한다', async ({ page }) => {
      const searchInput = page.locator('input[type="text"]').first();
      const placeholder = await searchInput.getAttribute('placeholder');

      expect(placeholder).toBeTruthy();
      expect(placeholder).toMatch(/입력|검색/);
    });

    test('키보드로 검색 타입을 변경할 수 있어야 한다', async ({ page }) => {
      const selectTrigger = page.locator('[role="combobox"]').first();
      await selectTrigger.focus();
      await selectTrigger.press('Enter');

      // 옵션 목록이 열림
      const options = page.locator('[role="option"]');
      await expect(options.first()).toBeVisible();

      // 키보드로 선택
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    });
  });

  test.describe('에러 처리', () => {
    test('API 오류 시 에러 상태가 표시되어야 한다', async ({ page }) => {
      // API 오류 시뮬레이션
      await page.route('**/api/search**', route => route.abort());

      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.fill('에러테스트');

      const searchButton = page.getByRole('button', { name: /검색/ });
      await searchButton.click();

      await page.waitForTimeout(2000);

      // 결과 없음 또는 에러 메시지
      const errorOrEmpty = page.getByText(/검색 결과가 없습니다|오류|실패/);
      await expect(errorOrEmpty.first()).toBeVisible({ timeout: 10000 });
    });
  });
});
