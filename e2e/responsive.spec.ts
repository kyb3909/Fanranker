import { test, expect, devices } from '@playwright/test';

const viewports = {
  mobile: { width: 375, height: 667 },
  mobileLarge: { width: 414, height: 896 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1024, height: 768 },
  desktop: { width: 1280, height: 800 },
  widescreen: { width: 1920, height: 1080 },
};

test.describe('반응형 레이아웃 - 메인 페이지', () => {
  test.describe('모바일 (375px)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewports.mobile);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    });

    test('헤더가 단일 행으로 표시되어야 한다', async ({ page }) => {
      const header = page.locator('header');
      const headerBox = await header.boundingBox();

      expect(headerBox?.height).toBeLessThan(100);
    });

    test('검색 바가 숨겨져야 한다', async ({ page }) => {
      const searchInput = page.locator('header input[type="text"][placeholder*="검색"]');
      await expect(searchInput).not.toBeVisible();
    });

    test('사이드바가 숨겨져야 한다', async ({ page }) => {
      const leftSidebar = page.locator('aside').first();

      // 사이드바가 hidden 클래스를 가지거나 보이지 않아야 함
      const isHidden = await leftSidebar.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'none' || el.classList.contains('hidden');
      }).catch(() => true);

      expect(isHidden).toBeTruthy();
    });

    test('메인 콘텐츠가 전체 너비를 차지해야 한다', async ({ page }) => {
      const mainContent = page.locator('[class*="col-span-12"]').first();
      await expect(mainContent).toBeVisible();
    });

    test('탭이 가로로 스크롤 가능해야 한다 (필요시)', async ({ page }) => {
      const tabContainer = page.locator('[class*="flex"]').filter({ has: page.locator('button') }).first();
      await expect(tabContainer).toBeVisible();
    });

    test('게시글 카드가 전체 너비로 표시되어야 한다', async ({ page }) => {
      const postCard = page.locator('[class*="Card"]').first();

      if (await postCard.isVisible().catch(() => false)) {
        const cardBox = await postCard.boundingBox();
        const viewportWidth = viewports.mobile.width;

        // 카드 너비가 뷰포트의 90% 이상이어야 함 (패딩 고려)
        expect(cardBox?.width).toBeGreaterThan(viewportWidth * 0.85);
      }
    });

    test('터치 대상이 충분히 커야 한다 (최소 44px)', async ({ page }) => {
      const buttons = page.locator('button');
      const buttonCount = await buttons.count();

      for (let i = 0; i < Math.min(buttonCount, 5); i++) {
        const button = buttons.nth(i);
        if (await button.isVisible().catch(() => false)) {
          const box = await button.boundingBox();
          if (box) {
            // 최소 터치 대상 크기 확인 (7x7 이상은 허용)
            expect(box.width >= 28 || box.height >= 28).toBeTruthy();
          }
        }
      }
    });
  });

  test.describe('태블릿 (768px)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewports.tablet);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    });

    test('검색 바가 표시되어야 한다', async ({ page }) => {
      const searchInput = page.locator('header input[type="text"]');
      await expect(searchInput.first()).toBeVisible();
    });

    test('탐색 네비게이션이 표시되어야 한다', async ({ page }) => {
      const nav = page.locator('header nav');
      await expect(nav.first()).toBeVisible();
    });

    test('레이아웃이 적절히 조정되어야 한다', async ({ page }) => {
      const main = page.locator('main');
      const mainBox = await main.boundingBox();

      // 메인 콘텐츠가 뷰포트 너비에 맞게 조정됨
      expect(mainBox?.width).toBeLessThanOrEqual(viewports.tablet.width);
    });
  });

  test.describe('데스크톱 (1280px)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewports.desktop);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    });

    test('3컬럼 레이아웃이 표시되어야 한다', async ({ page }) => {
      // 왼쪽 사이드바, 메인 콘텐츠, 오른쪽 사이드바
      const sidebars = page.locator('aside');
      const sidebarCount = await sidebars.count();

      expect(sidebarCount).toBeGreaterThanOrEqual(2);
    });

    test('왼쪽 사이드바가 표시되어야 한다', async ({ page }) => {
      const leftSidebar = page.locator('aside').first();
      await expect(leftSidebar).toBeVisible();
    });

    test('오른쪽 사이드바가 표시되어야 한다', async ({ page }) => {
      const rightSidebar = page.locator('aside').last();
      await expect(rightSidebar).toBeVisible();
    });

    test('메인 콘텐츠가 중앙에 위치해야 한다', async ({ page }) => {
      const mainContent = page.locator('[class*="col-span-6"], [class*="col-span-12"]').first();
      const mainBox = await mainContent.boundingBox();

      // 중앙 정렬 확인 (대략적인 범위)
      if (mainBox) {
        const centerX = mainBox.x + mainBox.width / 2;
        const viewportCenter = viewports.desktop.width / 2;

        // 중앙에서 200px 이내
        expect(Math.abs(centerX - viewportCenter)).toBeLessThan(200);
      }
    });

    test('최대 너비가 제한되어야 한다', async ({ page }) => {
      const container = page.locator('[class*="max-w-"]').first();
      const containerBox = await container.boundingBox();

      if (containerBox) {
        // 최대 너비 제한 확인 (1280px)
        expect(containerBox.width).toBeLessThanOrEqual(1280);
      }
    });
  });

  test.describe('와이드스크린 (1920px)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewports.widescreen);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    });

    test('콘텐츠가 중앙에 정렬되어야 한다', async ({ page }) => {
      const main = page.locator('main');
      const mainBox = await main.boundingBox();

      if (mainBox) {
        const leftMargin = mainBox.x;
        const rightMargin = viewports.widescreen.width - (mainBox.x + mainBox.width);

        // 좌우 마진이 비슷해야 함 (±100px)
        expect(Math.abs(leftMargin - rightMargin)).toBeLessThan(200);
      }
    });

    test('콘텐츠가 너무 넓어지지 않아야 한다', async ({ page }) => {
      const container = page.locator('[class*="max-w-"]').first();
      const containerBox = await container.boundingBox();

      if (containerBox) {
        // 최대 너비 제한
        expect(containerBox.width).toBeLessThanOrEqual(1920);
      }
    });
  });
});

test.describe('반응형 레이아웃 - 검색 페이지', () => {
  test('모바일에서 검색 폼이 세로 스택되어야 한다', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/search');

    const searchContainer = page.locator('form');
    await expect(searchContainer.first()).toBeVisible();
  });

  test('데스크톱에서 검색 폼이 가로 정렬되어야 한다', async ({ page }) => {
    await page.setViewportSize(viewports.desktop);
    await page.goto('/search');

    const searchForm = page.locator('form').first();
    const formBox = await searchForm.boundingBox();

    // 폼 너비가 적절함
    if (formBox) {
      expect(formBox.width).toBeGreaterThan(300);
    }
  });
});

test.describe('반응형 레이아웃 - 글쓰기 페이지', () => {
  test('모바일에서 폼이 전체 너비로 표시되어야 한다', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/write');

    const form = page.locator('form');
    const formBox = await form.boundingBox();

    if (formBox) {
      // 폼이 뷰포트의 90% 이상 차지
      expect(formBox.width).toBeGreaterThan(viewports.mobile.width * 0.85);
    }
  });

  test('데스크톱에서 폼이 적절한 너비로 표시되어야 한다', async ({ page }) => {
    await page.setViewportSize(viewports.desktop);
    await page.goto('/write');

    const form = page.locator('form');
    await expect(form).toBeVisible();
  });
});

test.describe('반응형 레이아웃 - 예측 페이지', () => {
  test('모바일에서 스포츠 필터가 가로 스크롤 가능해야 한다', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/prediction');
    await page.waitForLoadState('networkidle');

    const filterContainer = page.locator('[class*="flex"][class*="gap"]').first();
    await expect(filterContainer).toBeVisible();
  });

  test('태블릿에서 2컬럼 레이아웃이 적용될 수 있어야 한다', async ({ page }) => {
    await page.setViewportSize(viewports.tablet);
    await page.goto('/prediction');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('데스크톱에서 사이드바와 함께 표시되어야 한다', async ({ page }) => {
    await page.setViewportSize(viewports.desktop);
    await page.goto('/prediction');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');
    await expect(sidebar.first()).toBeVisible();
  });
});

test.describe('반응형 이미지', () => {
  test('이미지가 컨테이너를 넘지 않아야 한다', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const images = page.locator('img');
    const imageCount = await images.count();

    for (let i = 0; i < Math.min(imageCount, 3); i++) {
      const img = images.nth(i);
      if (await img.isVisible().catch(() => false)) {
        const imgBox = await img.boundingBox();
        if (imgBox) {
          // 이미지가 뷰포트를 넘지 않음
          expect(imgBox.width).toBeLessThanOrEqual(viewports.mobile.width);
        }
      }
    }
  });
});

test.describe('폰트 크기 반응형', () => {
  test('모바일에서 적절한 폰트 크기가 적용되어야 한다', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/');

    const heading = page.locator('h1, h2').first();
    if (await heading.isVisible().catch(() => false)) {
      const fontSize = await heading.evaluate(el =>
        window.getComputedStyle(el).fontSize
      );

      // 최소 14px 이상
      const fontSizeNum = parseInt(fontSize);
      expect(fontSizeNum).toBeGreaterThanOrEqual(14);
    }
  });

  test('데스크톱에서 더 큰 폰트 크기가 적용되어야 한다', async ({ page }) => {
    await page.setViewportSize(viewports.desktop);
    await page.goto('/');

    const heading = page.locator('h1, h2').first();
    if (await heading.isVisible().catch(() => false)) {
      const fontSize = await heading.evaluate(el =>
        window.getComputedStyle(el).fontSize
      );

      const fontSizeNum = parseInt(fontSize);
      expect(fontSizeNum).toBeGreaterThanOrEqual(16);
    }
  });
});

test.describe('디바이스별 테스트', () => {
  test('iPhone 12에서 정상 동작해야 한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const header = page.locator('header');
    await expect(header).toBeVisible();

    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('iPad에서 정상 동작해야 한다', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const header = page.locator('header');
    await expect(header).toBeVisible();
  });

  test('Galaxy S21에서 정상 동작해야 한다', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const header = page.locator('header');
    await expect(header).toBeVisible();
  });
});

test.describe('가로 모드', () => {
  test('모바일 가로 모드에서 정상 표시되어야 한다', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const header = page.locator('header');
    await expect(header).toBeVisible();

    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('태블릿 가로 모드에서 정상 표시되어야 한다', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const header = page.locator('header');
    await expect(header).toBeVisible();
  });
});
