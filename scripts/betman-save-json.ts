/**
 * Betman 경기 데이터 수집 → JSON 파일 저장
 *
 * 사용법:
 *   pnpm exec tsx scripts/betman-save-json.ts [gmTs]
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const GM_ID = 'G101';
const SLIP_URL = 'https://www.betman.co.kr/main/mainPage/gamebuy/gameSlip.do';
const API_INQ_PATH = '/buyPsblGame/gameInfoInq.do';

const handiMap: Record<number, string> = {
  0: '일반',
  2: '핸디캡',
  5: 'SUM',
  9: '언더오버',
  14: '일반',
};
const sportMap: Record<string, string> = {
  BK: '농구',
  SC: '축구',
  VL: '배구',
  BS: '야구',
};

/** UTC ms → KST ISO 문자열 (YYYY-MM-DDTHH:mm:ss+09:00) */
function toKSTISO(ms: number): string {
  const d = new Date(ms);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}+09:00`;
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

async function main() {
  const gmTs = process.argv[2] ?? '260018';
  console.log('gmTs:', gmTs);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    console.log('페이지 접속 중...');
    await page.goto(`${SLIP_URL}?gmId=${GM_ID}&gmTs=${gmTs}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    console.log('API 호출 중...');
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
      console.error('compSchedules.datas 없음:', Object.keys(json ?? {}));
      process.exit(1);
    }

    const games = parseGames(datas);
    console.log(`경기 수: ${games.length}개 (배당 있음) / 전체 ${datas.length}개`);

    const output = {
      gmTs,
      gmId: GM_ID,
      fetchedAt: new Date().toISOString(),
      totalGames: games.length,
      games,
    };

    const filePath = join(process.cwd(), `${gmTs}.json`);
    writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`✅ 저장 완료: ${filePath}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
