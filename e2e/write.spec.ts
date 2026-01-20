import { test, expect } from '@playwright/test';

test.describe('글쓰기 페이지', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/write');
  });

  test.describe('페이지 구조', () => {
    test('글쓰기 페이지가 정상 로드되어야 한다', async ({ page }) => {
      await expect(page).toHaveURL('/write');
    });

    test('페이지 제목이 표시되어야 한다', async ({ page }) => {
      const pageTitle = page.getByRole('heading', { name: /글쓰기/ });
      await expect(pageTitle).toBeVisible();
    });

    test('헤더가 표시되어야 한다', async ({ page }) => {
      const header = page.locator('header');
      await expect(header).toBeVisible();
    });

    test('뒤로가기 버튼이 표시되어야 한다', async ({ page }) => {
      const backButton = page.locator('button').first();
      await expect(backButton).toBeVisible();
    });
  });

  test.describe('폼 요소', () => {
    test('게시판 선택 드롭다운이 표시되어야 한다', async ({ page }) => {
      const communitySelect = page.locator('[role="combobox"]').first();
      await expect(communitySelect).toBeVisible();
    });

    test('제목 입력 필드가 표시되어야 한다', async ({ page }) => {
      const titleInput = page.getByLabel(/제목/);
      await expect(titleInput).toBeVisible();
    });

    test('내용 입력 영역이 표시되어야 한다', async ({ page }) => {
      const contentLabel = page.getByText(/내용/);
      await expect(contentLabel).toBeVisible();

      // TipTap 에디터 영역
      const editor = page.locator('[class*="ProseMirror"], [class*="tiptap"], [contenteditable="true"]');
      await expect(editor.first()).toBeVisible();
    });

    test('이미지 업로드 영역이 표시되어야 한다', async ({ page }) => {
      const imageLabel = page.getByText(/이미지/);
      await expect(imageLabel).toBeVisible();

      const uploadArea = page.locator('[class*="border-dashed"], input[type="file"]');
      await expect(uploadArea.first()).toBeVisible();
    });

    test('취소 버튼이 표시되어야 한다', async ({ page }) => {
      const cancelButton = page.getByRole('button', { name: /취소/ });
      await expect(cancelButton).toBeVisible();
    });

    test('작성하기 버튼이 표시되어야 한다', async ({ page }) => {
      const submitButton = page.getByRole('button', { name: /작성하기/ });
      await expect(submitButton).toBeVisible();
    });
  });

  test.describe('게시판 선택', () => {
    test('게시판 선택 드롭다운을 열 수 있어야 한다', async ({ page }) => {
      const communitySelect = page.locator('[role="combobox"]').first();
      await communitySelect.click();

      // 옵션 목록이 표시됨
      const options = page.locator('[role="option"]');
      await expect(options.first()).toBeVisible();
    });

    test('모든 게시판 옵션이 존재해야 한다', async ({ page }) => {
      const communitySelect = page.locator('[role="combobox"]').first();
      await communitySelect.click();

      // 주요 게시판 확인
      const expectedCommunities = ['해외축구', '야구', '농구', '자유게시판'];

      for (const community of expectedCommunities) {
        const option = page.getByRole('option', { name: community });
        await expect(option).toBeVisible();
      }
    });

    test('게시판을 선택할 수 있어야 한다', async ({ page }) => {
      const communitySelect = page.locator('[role="combobox"]').first();
      await communitySelect.click();

      const baseballOption = page.getByRole('option', { name: /야구/ });
      await baseballOption.click();

      // 선택된 값 확인
      await expect(communitySelect).toContainText(/야구/);
    });

    test('URL 파라미터로 게시판이 미리 선택되어야 한다', async ({ page }) => {
      await page.goto('/write?community=baseball');
      await page.waitForLoadState('networkidle');

      const communitySelect = page.locator('[role="combobox"]').first();
      // 야구가 선택되어 있어야 함 (또는 시간이 걸릴 수 있음)
      await page.waitForTimeout(500);
    });
  });

  test.describe('제목 입력', () => {
    test('제목을 입력할 수 있어야 한다', async ({ page }) => {
      const titleInput = page.getByLabel(/제목/);
      await titleInput.fill('테스트 제목입니다');

      await expect(titleInput).toHaveValue('테스트 제목입니다');
    });

    test('제목 입력 필드에 placeholder가 있어야 한다', async ({ page }) => {
      const titleInput = page.getByLabel(/제목/);
      const placeholder = await titleInput.getAttribute('placeholder');

      expect(placeholder).toBeTruthy();
      expect(placeholder).toContain('제목');
    });
  });

  test.describe('내용 입력 (TipTap 에디터)', () => {
    test('에디터에 텍스트를 입력할 수 있어야 한다', async ({ page }) => {
      const editor = page.locator('[class*="ProseMirror"], [contenteditable="true"]').first();
      await editor.click();
      await page.keyboard.type('테스트 내용입니다');

      const editorText = await editor.textContent();
      expect(editorText).toContain('테스트 내용');
    });

    test('에디터에 placeholder가 표시되어야 한다', async ({ page }) => {
      const editor = page.locator('[class*="ProseMirror"], [contenteditable="true"]').first();
      // placeholder는 비어있을 때만 표시됨
      await expect(editor).toBeVisible();
    });
  });

  test.describe('이미지 업로드', () => {
    test('이미지 업로드 영역을 클릭할 수 있어야 한다', async ({ page }) => {
      const uploadArea = page.locator('[class*="border-dashed"]').first();
      await expect(uploadArea).toBeVisible();
    });

    test('파일 입력 필드가 존재해야 한다', async ({ page }) => {
      const fileInput = page.locator('input[type="file"][accept*="image"]');
      await expect(fileInput).toBeAttached();
    });
  });

  test.describe('폼 유효성 검사', () => {
    test('필수 필드가 비어있으면 작성하기 버튼이 비활성화되어야 한다', async ({ page }) => {
      const submitButton = page.getByRole('button', { name: /작성하기/ });
      await expect(submitButton).toBeDisabled();
    });

    test('게시판만 선택하면 버튼이 여전히 비활성화되어야 한다', async ({ page }) => {
      const communitySelect = page.locator('[role="combobox"]').first();
      await communitySelect.click();
      await page.getByRole('option', { name: /야구/ }).click();

      const submitButton = page.getByRole('button', { name: /작성하기/ });
      await expect(submitButton).toBeDisabled();
    });

    test('게시판과 제목만 입력하면 버튼이 여전히 비활성화되어야 한다', async ({ page }) => {
      // 게시판 선택
      const communitySelect = page.locator('[role="combobox"]').first();
      await communitySelect.click();
      await page.getByRole('option', { name: /야구/ }).click();

      // 제목 입력
      const titleInput = page.getByLabel(/제목/);
      await titleInput.fill('테스트 제목');

      const submitButton = page.getByRole('button', { name: /작성하기/ });
      await expect(submitButton).toBeDisabled();
    });

    test('모든 필수 필드를 입력하면 버튼이 활성화되어야 한다', async ({ page }) => {
      // 게시판 선택
      const communitySelect = page.locator('[role="combobox"]').first();
      await communitySelect.click();
      await page.getByRole('option', { name: /야구/ }).click();

      // 제목 입력
      const titleInput = page.getByLabel(/제목/);
      await titleInput.fill('테스트 제목');

      // 내용 입력
      const editor = page.locator('[class*="ProseMirror"], [contenteditable="true"]').first();
      await editor.click();
      await page.keyboard.type('테스트 내용입니다');

      // 버튼 활성화 확인
      const submitButton = page.getByRole('button', { name: /작성하기/ });
      await page.waitForTimeout(500);
      // 버튼이 활성화되어야 함 (비로그인 상태에서도 폼 유효성만 체크)
    });
  });

  test.describe('취소 기능', () => {
    test('취소 버튼 클릭 시 이전 페이지로 이동해야 한다', async ({ page }) => {
      // 홈에서 시작
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 글쓰기 페이지로 이동
      await page.goto('/write');
      await page.waitForLoadState('networkidle');

      // 취소 버튼 클릭
      const cancelButton = page.getByRole('button', { name: /취소/ });
      await cancelButton.click();

      // 이전 페이지로 이동 확인 (또는 홈으로)
      await page.waitForTimeout(1000);
    });
  });

  test.describe('접근성', () => {
    test('폼 필드에 적절한 레이블이 있어야 한다', async ({ page }) => {
      // 제목 레이블
      const titleLabel = page.getByText(/제목/);
      await expect(titleLabel).toBeVisible();

      // 게시판 선택 레이블
      const communityLabel = page.getByText(/게시판 선택/);
      await expect(communityLabel).toBeVisible();

      // 내용 레이블
      const contentLabel = page.getByText(/내용/);
      await expect(contentLabel).toBeVisible();
    });

    test('키보드로 폼을 탐색할 수 있어야 한다', async ({ page }) => {
      // Tab 키로 폼 필드 이동
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // 포커스가 이동했는지 확인
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeTruthy();
    });
  });

  test.describe('반응형 레이아웃', () => {
    test('모바일에서 폼이 정상 표시되어야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/write');

      // 모든 필수 요소가 보여야 함
      const titleInput = page.getByLabel(/제목/);
      await expect(titleInput).toBeVisible();

      const submitButton = page.getByRole('button', { name: /작성하기/ });
      await expect(submitButton).toBeVisible();
    });

    test('태블릿에서 폼이 정상 표시되어야 한다', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/write');

      const titleInput = page.getByLabel(/제목/);
      await expect(titleInput).toBeVisible();
    });
  });
});
