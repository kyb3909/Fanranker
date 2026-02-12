/**
 * Betman 경기 데이터 수집 (Playwright)
 *
 * gameSlip.do 페이지를 브라우저로 열고, 페이지 컨텍스트에서 gameInfoInq.do API를
 * 호출해 JSON을 받은 뒤 파싱하여 /api/betman/round + /api/betman/games 로 저장합니다.
 *
 * 사용법:
 *   pnpm exec tsx scripts/betman-fetch-games.ts [gmTs]
 *   BETMAN_GM_TS=260018 pnpm exec tsx scripts/betman-fetch-games.ts
 *
 * 필요: playwright 패키지 (pnpm add -D playwright)
 */

import { chromium } from 'playwright';

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

function parseGames(datas: unknown[][]): Array<Record<string, unknown>> {
  const games: Array<Record<string, unknown>> = [];
  for (let i = 0; i < datas.length; i++) {
    const d = datas[i];
    const winAllot = (d[16] as number) || 0;
    const drawAllot = (d[17] as number) || 0;
    const loseAllot = (d[18] as number) || 0;
    if (winAllot === 0 && drawAllot === 0 && loseAllot === 0) continue;

    const handi = d[19] as number;
    const gameType = handiMap[handi] ?? '일반';
    const gameDate = d[3] as number | undefined;

    // 핸디캡/기준선 값 추출 (d[20]에 저장됨)
    // 핸디캡: 음수면 홈팀이 핸디 부여, 양수면 홈팀이 핸디 받음
    // 언더오버: 기준선 (예: 218.5)
    const rawHandicapValue = d[20] as number | null;

    // 게임 타입에 따라 다른 컬럼에 저장
    const handicapSpread = gameType === '핸디캡' ? rawHandicapValue : null;
    const overUnderLine = gameType === '언더오버' ? rawHandicapValue : null;

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
      game_no: d[11],
      match_time: gameDate
        ? toKSTISO(gameDate)
        : toKSTISO(Date.now()),
      sport: sportMap[(d[0] as string) ?? ''] ?? (d[0] as string),
      game_type: gameType,
      home_team_name: (d[14] as string) ?? '',
      away_team_name: (d[15] as string) ?? '',
      league_code: (d[7] as string) || null,
      venue: (d[10] as string) || null,
      status: 'scheduled',
      // 핸디캡 스프레드 (핸디캡 게임용)
      handicap: handicapSpread,
      // 언오버 기준선 (언오버 게임용)
      over_under_line: overUnderLine,
      home_win_odds,
      away_win_odds,
      draw_odds,
      over_odds,
      under_odds,
      odd_odds,
      even_odds,
    });
  }
  return games;
}

async function main() {
  const gmTs =
    process.env.BETMAN_GM_TS ?? process.argv[2] ?? '260018';
  const apiBase =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    'http://localhost:3000';

  console.log('gmTs:', gmTs, '| API:', apiBase);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
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
      console.error('compSchedules.datas 없음:', Object.keys(json ?? {}));
      process.exit(1);
    }

    const games = parseGames(datas);
    console.log('경기 수 (배당 있음):', games.length, '/', datas.length);

    const roundRes = await fetch(`${apiBase}/api/betman/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gmTs }),
    });
    if (!roundRes.ok) {
      console.error('round API 실패:', roundRes.status, await roundRes.text());
      process.exit(1);
    }
    const roundBody = (await roundRes.json()) as { roundId?: string };
    const roundId = roundBody.roundId;
    if (!roundId) {
      console.error('roundId 없음:', roundBody);
      process.exit(1);
    }
    console.log('roundId:', roundId);

    const gamesRes = await fetch(`${apiBase}/api/betman/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId, games }),
    });
    if (!gamesRes.ok) {
      console.error('games API 실패:', gamesRes.status, await gamesRes.text());
      process.exit(1);
    }
    const gamesBody = await gamesRes.json();
    console.log('저장 완료:', gamesBody);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
