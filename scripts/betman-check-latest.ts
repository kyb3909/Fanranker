/**
 * Betman 최신 gmTs 확인 스크립트
 *
 * betman.co.kr 메인 페이지에서 현재 진행 중인 회차(gmTs)를 가져옵니다.
 *
 * 사용법:
 *   pnpm exec tsx scripts/betman-check-latest.ts
 *
 * 출력 (JSON):
 *   { "gmTs": "260019", "isNew": true, "activeRounds": ["260018", "260019"] }
 */

import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const BETMAN_MAIN = 'https://www.betman.co.kr/main/mainPage/gamebuy/gameSlip.do';
const STATE_FILE = join(process.cwd(), 'data', 'betman-state.json');

interface BetmanState {
  lastChecked: string;
  activeRounds: string[];
  latestGmTs: string;
}

function loadState(): BetmanState {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  }
  return {
    lastChecked: '',
    activeRounds: [],
    latestGmTs: '',
  };
}

function saveState(state: BetmanState) {
  const dir = join(process.cwd(), 'data');
  if (!existsSync(dir)) {
    require('fs').mkdirSync(dir, { recursive: true });
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

async function main() {
  const state = loadState();
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    // betman 메인 페이지 접속
    await page.goto(BETMAN_MAIN, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 현재 URL에서 gmTs 추출 또는 페이지에서 회차 정보 추출
    const currentUrl = page.url();
    const urlMatch = currentUrl.match(/gmTs=(\d+)/);

    let latestGmTs = '';

    if (urlMatch) {
      latestGmTs = urlMatch[1];
    } else {
      // 페이지 내에서 회차 정보 찾기
      latestGmTs = await page.evaluate(() => {
        // 회차 선택 드롭다운이나 표시된 회차 번호 찾기
        const selectEl = document.querySelector('select[name="gmTs"], #gmTs') as HTMLSelectElement;
        if (selectEl) {
          return selectEl.value;
        }

        // URL 파라미터에서 찾기
        const params = new URLSearchParams(window.location.search);
        return params.get('gmTs') || '';
      });
    }

    if (!latestGmTs) {
      // 기본값으로 현재 알려진 최신 회차 사용
      console.error('gmTs를 찾을 수 없음, 기존 상태 유지');
      console.log(JSON.stringify({
        gmTs: state.latestGmTs,
        isNew: false,
        activeRounds: state.activeRounds,
        error: 'gmTs not found in page'
      }));
      return;
    }

    const isNew = !state.activeRounds.includes(latestGmTs);

    if (isNew) {
      state.activeRounds.push(latestGmTs);
      // 오래된 라운드 제거 (최근 5개만 유지)
      if (state.activeRounds.length > 5) {
        state.activeRounds = state.activeRounds.slice(-5);
      }
    }

    state.latestGmTs = latestGmTs;
    state.lastChecked = new Date().toISOString();
    saveState(state);

    const result = {
      gmTs: latestGmTs,
      isNew,
      activeRounds: state.activeRounds,
      lastChecked: state.lastChecked,
    };

    console.log(JSON.stringify(result));

  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
