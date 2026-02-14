/**
 * Betman 경기 결과 수집 (Playwright)
 *
 * winrstDetl.do 페이지를 브라우저로 열고, 페이지 컨텍스트에서
 * inqWinrstDetlBody.do API를 호출해 경기 결과를 받은 뒤
 * /api/betman/results 로 DB에 저장합니다.
 *
 * 사용법:
 *   pnpm exec tsx scripts/betman-fetch-results.ts [gmTs]
 *   BETMAN_GM_TS=260018 pnpm exec tsx scripts/betman-fetch-results.ts
 */

import { chromium } from 'playwright';

const GM_ID = 'G101';
const RESULT_URL = 'https://www.betman.co.kr/main/mainPage/gamebuy/winrstDetl.do';
const API_BODY_PATH = '/gamebuy/winrst/inqWinrstDetlBody.do';

// HANDI_VAL → game_type (기존 fetch-games와 동일)
const handiMap: Record<number, string> = {
  0: '일반',
  2: '핸디캡',
  5: 'SUM',
  9: '언더오버',
  14: '일반',
};

// GAME_RESULT 코드 → DB result 값 (게임 타입별)
function mapGameResult(
  gameResult: string,
  gameType: string
): { result: string; status: string } {
  // 취소/적특
  if (gameResult === '4') {
    return { result: 'cancelled', status: 'cancelled' };
  }

  if (gameType === '일반' || gameType === '핸디캡') {
    // 0=WIN(홈승), 1=DRAW(무), 2=LOSE(원정승)
    if (gameResult === '0') return { result: 'home', status: 'completed' };
    if (gameResult === '1') return { result: 'draw', status: 'completed' };
    if (gameResult === '2') return { result: 'away', status: 'completed' };
  } else if (gameType === '언더오버') {
    // 0=WIN(언더), 2=LOSE(오버)
    if (gameResult === '0') return { result: 'under', status: 'completed' };
    if (gameResult === '2') return { result: 'over', status: 'completed' };
  }
  // SUM(홀짝) — 예측 대상 아님, 결과만 기록
  // DB CHECK 제약에 'odd'/'even' 없으므로 null 처리
  return { result: '', status: 'completed' };
}

/** MCH_SCORE 파싱: "104:101" → { home: 104, away: 101 } */
function parseScore(mchScore: string): { home: number; away: number } | null {
  if (!mchScore || !mchScore.includes(':')) return null;
  const [h, a] = mchScore.split(':').map(Number);
  if (isNaN(h) || isNaN(a)) return null;
  return { home: h, away: a };
}

interface ResultItem {
  GAME_RESULT: string;
  GM_SEQ: number;
  MCH_SCORE: string;
  HANDI_VAL: number;
  HOME_TEAM: string;
  AWAY_TEAM: string;
  FIX_MCH_DTM: string;
  ODDS_WIN: number;
  ODDS_DRAW: number;
  ODDS_LOSE: number;
  MCH_SPORT_CD: string;
  LEAG_CD_NM: string;
  PR_ST_VAL: string;
}

async function main() {
  const gmTs = process.env.BETMAN_GM_TS ?? process.argv[2] ?? '260018';
  const apiBase =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    'http://localhost:3000';

  console.log(`gmTs: ${gmTs} | API: ${apiBase}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${RESULT_URL}?gmId=${GM_ID}&gmTs=${gmTs}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 결과 API 호출
    const bodyResult = await page.evaluate(
      async (params: { gmId: string; gmTs: number; path: string }) => {
        const resp = await fetch(params.path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            gmId: params.gmId,
            gmTs: params.gmTs,
            _sbmInfo: { _sbmInfo: { debugMode: 'false' } },
          }),
        });
        return resp.json();
      },
      { gmId: GM_ID, gmTs: Number(gmTs), path: API_BODY_PATH }
    );

    const items: ResultItem[] = bodyResult?.detlBody;
    if (!Array.isArray(items) || items.length === 0) {
      console.error('결과 데이터 없음:', Object.keys(bodyResult ?? {}));
      process.exit(1);
    }

    console.log(`결과 데이터 수신: ${items.length}건`);

    // 실제 스코어 맵 구축 (일반 게임에서 실제 점수 추출)
    // key: "HOME_TEAM|AWAY_TEAM|FIX_MCH_DTM"
    const actualScoreMap = new Map<string, { home: number; away: number }>();
    for (const item of items) {
      const gameType = handiMap[item.HANDI_VAL] ?? '일반';
      if (gameType === '일반') {
        const score = parseScore(item.MCH_SCORE);
        if (score) {
          const key = `${item.HOME_TEAM.trim()}|${item.AWAY_TEAM.trim()}|${item.FIX_MCH_DTM}`;
          actualScoreMap.set(key, score);
        }
      }
    }

    // 결과 매핑
    const results: Array<{
      game_no: number;
      home_score: number | null;
      away_score: number | null;
      result: string;
      status: string;
    }> = [];

    let skippedSUM = 0;

    for (const item of items) {
      const gameType = handiMap[item.HANDI_VAL] ?? '일반';
      const { result, status } = mapGameResult(item.GAME_RESULT, gameType);

      // SUM(홀짝)은 DB CHECK 제약에 없으므로 result 설정 불가 → 상태만 업데이트
      if (gameType === 'SUM' && result === '') {
        // SUM 게임은 status만 completed로 업데이트, result는 null 유지
        results.push({
          game_no: item.GM_SEQ,
          home_score: null,
          away_score: null,
          result: '', // API에서 빈 값이면 null 처리하도록
          status: item.GAME_RESULT === '4' ? 'cancelled' : 'completed',
        });
        skippedSUM++;
        continue;
      }

      // 실제 점수 조회 (같은 팀/시간의 일반 게임에서)
      const matchKey = `${item.HOME_TEAM.trim()}|${item.AWAY_TEAM.trim()}|${item.FIX_MCH_DTM}`;
      let homeScore: number | null = null;
      let awayScore: number | null = null;

      if (gameType === '일반') {
        // 일반 게임은 MCH_SCORE가 실제 점수
        const score = parseScore(item.MCH_SCORE);
        if (score) {
          homeScore = score.home;
          awayScore = score.away;
        }
      } else {
        // 핸디캡/언더오버는 일반 게임의 실제 점수 사용
        const actual = actualScoreMap.get(matchKey);
        if (actual) {
          homeScore = actual.home;
          awayScore = actual.away;
        }
      }

      results.push({
        game_no: item.GM_SEQ,
        home_score: homeScore,
        away_score: awayScore,
        result,
        status,
      });
    }

    // 통계 출력
    const completed = results.filter(r => r.status === 'completed').length;
    const cancelled = results.filter(r => r.status === 'cancelled').length;
    console.log(`매핑 완료: completed=${completed}, cancelled=${cancelled}, SUM(result빈값)=${skippedSUM}`);

    // API 호출하여 DB 업데이트
    const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.CRON_SECRET) {
      authHeaders['Authorization'] = `Bearer ${process.env.CRON_SECRET}`;
    }

    const res = await fetch(`${apiBase}/api/betman/results`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ gmTs, results }),
    });

    if (!res.ok) {
      console.error('results API 실패:', res.status, await res.text());
      process.exit(1);
    }

    const resBody = await res.json();
    console.log('저장 완료:', resBody);

    // === 자동 정산 트리거 ===
    console.log('\n--- 정산 시작 ---');
    const settleRes = await fetch(`${apiBase}/api/betman/settle`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ gm_ts: gmTs }),
    });

    if (!settleRes.ok) {
      console.error('정산 API 실패:', settleRes.status, await settleRes.text());
    } else {
      const settleBody = await settleRes.json();
      console.log('정산 완료:', settleBody);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
