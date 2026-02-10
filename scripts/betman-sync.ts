/**
 * Betman 데이터 동기화 스크립트 (n8n용)
 *
 * 기능:
 *   1. 최신 gmTs 확인
 *   2. 새 라운드 → JSON 생성 + DB 저장
 *   3. 기존 라운드 → JSON 갱신 + DB 업데이트
 *
 * 사용법:
 *   pnpm exec tsx scripts/betman-sync.ts [--check-only] [--gmts=260018]
 *
 * 옵션:
 *   --check-only: 최신 gmTs 확인만 (데이터 수집 안함)
 *   --gmts=XXXXX: 특정 gmTs 지정
 *
 * 출력 (JSON):
 *   {
 *     "action": "created" | "updated" | "checked",
 *     "gmTs": "260018",
 *     "gamesCount": 194,
 *     "jsonPath": "data/260018.json"
 *   }
 */

import { chromium, Browser, Page } from 'playwright';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const GM_ID = 'G101';
const SLIP_URL = 'https://www.betman.co.kr/main/mainPage/gamebuy/gameSlip.do';
const API_INQ_PATH = '/buyPsblGame/gameInfoInq.do';
const DATA_DIR = join(process.cwd(), 'data');
const STATE_FILE = join(DATA_DIR, 'betman-state.json');

const handiMap: Record<number, string> = {
  0: '일반', 2: '핸디캡', 5: 'SUM', 9: '언더오버', 14: '일반',
};
const sportMap: Record<string, string> = {
  BK: '농구', SC: '축구', VL: '배구', BS: '야구',
};

interface BetmanState {
  lastChecked: string;
  activeRounds: string[];
  latestGmTs: string;
}

interface Game {
  game_no: number;
  match_time: string;
  sport: string;
  league: string;
  game_type: string;
  home_team: string;
  away_team: string;
  home_win_odds: number | null;
  draw_odds: number | null;
  away_win_odds: number | null;
  over_odds: number | null;
  under_odds: number | null;
  odd_odds: number | null;
  even_odds: number | null;
}

interface SyncResult {
  action: 'created' | 'updated' | 'checked' | 'error';
  gmTs: string;
  isNew?: boolean;
  gamesCount?: number;
  jsonPath?: string;
  activeRounds?: string[];
  error?: string;
}

// KST ISO 문자열 변환
function toKSTISO(ms: number): string {
  const d = new Date(ms);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}+09:00`;
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadState(): BetmanState {
  ensureDataDir();
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  }
  return { lastChecked: '', activeRounds: [], latestGmTs: '' };
}

function saveState(state: BetmanState) {
  ensureDataDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function parseGames(datas: unknown[][]): Game[] {
  const games: Game[] = [];
  for (const d of datas) {
    const winAllot = (d[16] as number) || 0;
    const drawAllot = (d[17] as number) || 0;
    const loseAllot = (d[18] as number) || 0;
    if (winAllot === 0 && drawAllot === 0 && loseAllot === 0) continue;

    const handi = d[19] as number;
    const gameType = handiMap[handi] ?? '일반';
    const gameDate = d[3] as number | undefined;

    let home_win_odds: number | null = null;
    let away_win_odds: number | null = null;
    let draw_odds: number | null = null;
    let over_odds: number | null = null;
    let under_odds: number | null = null;
    let odd_odds: number | null = null;
    let even_odds: number | null = null;

    if (gameType === '일반' || gameType === '핸디캡') {
      home_win_odds = winAllot > 0 ? winAllot : null;
      draw_odds = drawAllot > 0 ? drawAllot : null;
      away_win_odds = loseAllot > 0 ? loseAllot : null;
    } else if (gameType === '언더오버') {
      under_odds = winAllot > 0 ? winAllot : null;
      over_odds = loseAllot > 0 ? loseAllot : null;
    } else if (gameType === 'SUM') {
      odd_odds = winAllot > 0 ? winAllot : null;
      even_odds = loseAllot > 0 ? loseAllot : null;
    }

    games.push({
      game_no: d[11] as number,
      match_time: gameDate ? toKSTISO(gameDate) : toKSTISO(Date.now()),
      sport: sportMap[(d[0] as string) ?? ''] ?? (d[0] as string),
      league: (d[7] as string) || '',
      game_type: gameType,
      home_team: (d[14] as string) ?? '',
      away_team: (d[15] as string) ?? '',
      home_win_odds,
      draw_odds,
      away_win_odds,
      over_odds,
      under_odds,
      odd_odds,
      even_odds,
    });
  }
  return games;
}

async function fetchGames(page: Page, gmTs: string): Promise<Game[]> {
  await page.goto(`${SLIP_URL}?gmId=${GM_ID}&gmTs=${gmTs}`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  const json = await page.evaluate(
    async (params: { gmId: string; gmTs: string; path: string }) => {
      const resp = await fetch(params.path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          gmId: params.gmId,
          gmTs: Number(params.gmTs),
          gameYear: '',
          _sbmInfo: { _sbmInfo: { debugMode: 'false' } },
        }),
      });
      return resp.json();
    },
    { gmId: GM_ID, gmTs, path: API_INQ_PATH }
  );

  const datas = json?.compSchedules?.datas;
  if (!Array.isArray(datas)) {
    throw new Error(`compSchedules.datas 없음: ${JSON.stringify(Object.keys(json ?? {}))}`);
  }

  return parseGames(datas);
}

async function saveToJson(gmTs: string, games: Game[]): Promise<string> {
  ensureDataDir();
  const filePath = join(DATA_DIR, `${gmTs}.json`);

  const output = {
    gmTs,
    gmId: GM_ID,
    updatedAt: new Date().toISOString(),
    totalGames: games.length,
    games,
  };

  writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
  return filePath;
}

async function saveToApi(gmTs: string, games: Game[]): Promise<string | null> {
  const apiBase = process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    'http://localhost:3000';

  try {
    // Round 생성/조회
    const roundRes = await fetch(`${apiBase}/api/betman/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gmTs }),
    });

    if (!roundRes.ok) {
      console.error('round API 실패:', roundRes.status);
      return null;
    }

    const roundBody = await roundRes.json() as { roundId?: string };
    const roundId = roundBody.roundId;
    if (!roundId) return null;

    // Games 저장
    const gamesRes = await fetch(`${apiBase}/api/betman/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId, games }),
    });

    if (!gamesRes.ok) {
      console.error('games API 실패:', gamesRes.status);
      return null;
    }

    return roundId;
  } catch (e) {
    console.error('API 호출 오류:', e);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check-only');
  const gmTsArg = args.find(a => a.startsWith('--gmts='))?.split('=')[1];
  const skipApi = args.includes('--skip-api');

  const state = loadState();
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    // gmTs 결정
    let gmTs = gmTsArg;

    if (!gmTs) {
      // 페이지에서 최신 gmTs 확인
      await page.goto(SLIP_URL, { waitUntil: 'networkidle', timeout: 30000 });

      const currentUrl = page.url();
      const urlMatch = currentUrl.match(/gmTs=(\d+)/);
      gmTs = urlMatch?.[1] ?? '';

      if (!gmTs) {
        gmTs = await page.evaluate(() => {
          const params = new URLSearchParams(window.location.search);
          return params.get('gmTs') || '';
        });
      }
    }

    if (!gmTs) {
      const result: SyncResult = {
        action: 'error',
        gmTs: '',
        error: 'gmTs를 찾을 수 없음',
      };
      console.log(JSON.stringify(result));
      return;
    }

    const isNew = !state.activeRounds.includes(gmTs);

    // 상태 업데이트
    if (isNew) {
      state.activeRounds.push(gmTs);
      if (state.activeRounds.length > 5) {
        state.activeRounds = state.activeRounds.slice(-5);
      }
    }
    state.latestGmTs = gmTs;
    state.lastChecked = new Date().toISOString();
    saveState(state);

    if (checkOnly) {
      const result: SyncResult = {
        action: 'checked',
        gmTs,
        isNew,
        activeRounds: state.activeRounds,
      };
      console.log(JSON.stringify(result));
      return;
    }

    // 데이터 수집
    const games = await fetchGames(page, gmTs);
    const jsonPath = await saveToJson(gmTs, games);

    // API 저장 (옵션)
    if (!skipApi) {
      await saveToApi(gmTs, games);
    }

    const result: SyncResult = {
      action: isNew ? 'created' : 'updated',
      gmTs,
      isNew,
      gamesCount: games.length,
      jsonPath,
      activeRounds: state.activeRounds,
    };

    console.log(JSON.stringify(result));

  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.log(JSON.stringify({ action: 'error', error: e.message }));
  process.exit(1);
});
