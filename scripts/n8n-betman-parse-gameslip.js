/**
 * n8n Code 노드: gameInfoInq.do JSON → games 배열
 *
 * ■ 워크플로우 구성 (6단계):
 *   1. HTTP Request: POST /api/betman/round → roundId
 *   2. HTTP Request: GET gameSlip.do (Full Response ON) → Set-Cookie 포함
 *   3. Code: 쿠키 추출 (n8n-betman-extract-cookies.js)
 *   4. HTTP Request: POST gameInfoInq.do (Cookie 헤더 = {{ $json.cookies }})
 *   5. 이 Code 노드: JSON 파싱 → { roundId, games }
 *   6. HTTP Request: POST /api/betman/games
 *
 * ■ 아래 노드 이름을 실제 이름으로 맞춰 주세요.
 */
var roundNode = 'HTTP Request';   // 1단계: round API 호출 노드 이름

var roundId = '';
try { roundId = $(roundNode).first().json.roundId || ''; } catch (e) {}

// 이전 노드(4단계 HTTP Request)의 응답
var raw = $input.first().json;

if (!raw) {
  return [{ json: { roundId: roundId, games: [], _debug: 'gameInfoInq 응답이 null' } }];
}

// 응답에서 compSchedules 찾기
var data = null;
if (raw.compSchedules) {
  data = raw;
} else if (raw.body && typeof raw.body === 'object' && raw.body.compSchedules) {
  data = raw.body;
} else if (typeof raw.body === 'string') {
  try { data = JSON.parse(raw.body); } catch (e) {}
} else if (typeof raw.data === 'string') {
  try { data = JSON.parse(raw.data); } catch (e) {}
} else if (raw.data && typeof raw.data === 'object' && raw.data.compSchedules) {
  data = raw.data;
}

if (!data || !data.compSchedules || !data.compSchedules.datas) {
  var topKeys = [];
  for (var k in raw) { if (raw.hasOwnProperty(k)) topKeys.push(k); }
  return [{ json: {
    roundId: roundId,
    games: [],
    _debug: {
      msg: 'compSchedules 못 찾음',
      topKeys: topKeys.slice(0, 20),
      rawType: typeof raw,
      sample: JSON.stringify(raw).substring(0, 500)
    }
  } }];
}

var datas = data.compSchedules.datas;

// handi 값 → 게임유형
var handiMap = { 0: '일반', 2: '핸디캡', 5: 'SUM', 9: '언더오버', 14: '일반' };
var sportMap = { 'BK': '농구', 'SC': '축구', 'VL': '배구', 'BS': '야구' };

// UTC ms → KST ISO 문자열 (YYYY-MM-DDTHH:mm:ss+09:00)
function toKSTISO(ms) {
  var d = new Date(ms);
  var kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return kst.getUTCFullYear() + '-' + pad(kst.getUTCMonth() + 1) + '-' + pad(kst.getUTCDate()) +
    'T' + pad(kst.getUTCHours()) + ':' + pad(kst.getUTCMinutes()) + ':' + pad(kst.getUTCSeconds()) + '+09:00';
}

var games = [];
for (var i = 0; i < datas.length; i++) {
  var d = datas[i];
  // 0:itemCode 3:gameDate 6:leagueCode 7:leagueName 10:venue
  // 11:matchSeq 14:homeName 15:awayName
  // 16:winAllot 17:drawAllot 18:loseAllot 19:handi 20:winHandi 27:protoStatus

  var itemCode = d[0] || '';
  var leagueName = d[7] || '';
  var venue = d[10] || '';
  var matchSeq = d[11];
  var homeName = d[14] || '';
  var awayName = d[15] || '';
  var winAllot = d[16] || 0;
  var drawAllot = d[17] || 0;
  var loseAllot = d[18] || 0;
  var handi = d[19];
  var gameDate = d[3];

  // 배당 모두 0이면 미발매 → 건너뛰기
  if (winAllot === 0 && drawAllot === 0 && loseAllot === 0) continue;

  var sport = sportMap[itemCode] || itemCode;
  var gameType = handiMap[handi] != null ? handiMap[handi] : '일반';
  var matchTime = gameDate ? toKSTISO(gameDate) : '';

  var home_win_odds = null, away_win_odds = null, draw_odds = null;
  var over_odds = null, under_odds = null, odd_odds = null, even_odds = null;

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
    game_no: matchSeq,
    match_time: matchTime || toKSTISO(Date.now()),
    sport: sport,
    game_type: gameType,
    home_team_name: homeName,
    away_team_name: awayName,
    league_code: leagueName || null,
    venue: venue || null,
    home_win_odds: home_win_odds,
    away_win_odds: away_win_odds,
    draw_odds: draw_odds,
    over_odds: over_odds,
    under_odds: under_odds,
    odd_odds: odd_odds,
    even_odds: even_odds,
  });
}

return [{ json: { roundId: roundId, games: games } }];
