/**
 * betman league_code → live-football-api 리그 id (2026-08-17).
 *
 * ⚠️ 이 파일은 `scripts/gen-lfa-leagues.ts` 가 카탈로그에서 생성한다. 손으로 고치지 말 것 —
 *    32자 해시는 눈으로 검증이 안 된다. 리그를 추가하려면 생성기의 RULES 에 한 줄 넣고 재생성한다.
 *
 * 매핑 키가 (국가, 리그명) 쌍인 이유: 이름만으로는 충돌한다. "Premier League" 는 잉글랜드와
 * 아르헨티나에, "Serie A" 는 이탈리아와 브라질에 둘 다 존재한다. 자국 컵대회는 이름이 그냥
 * "Cup"(코파 이탈리아·쿠프 드 프랑스·DFB 포칼)이고 슈퍼컵은 "Super Cup" 이다.
 */

/** betman league_code → LFA league id */
export const LFA_LEAGUE_IDS: ReadonlyMap<string, string> = new Map([
  ["EPL", "2kwbbcootiqqgmrzs6o5inle5"], // England / Premier League
  ["라리가", "34pl8szyvrbwcmfkuocjm3r6t"], // Spain / LaLiga
  ["세리에A", "1r097lpxe0xn03ihb7wi98kao"], // Italy / Serie A
  ["분데스리", "6by3h89i2eykc341oz7lv1ddd"], // Germany / Bundesliga
  ["프리그1", "dm5ka0os1e3dxcp3vh05kmp33"], // France / Ligue 1
  ["UCL", "4oogyu6o156iphvdvphwpck10"], // Europe / Champions League
  ["UEL", "4c1nfi2j1m731hcay25fcgndq"], // Europe / Europa League
  ["UECL", "c7b8o53flg36wbuevfzy3lb10"], // Europe / Conference League
  ["U슈퍼컵", "a0f4gtru0oyxmpvty4thc5qkc"], // Europe / UEFA Super Cup
  ["EFL챔", "7ntvbsyq31jnzoqoa8850b9b8"], // England / Championship
  ["잉글FA컵", "2hj3286pqov1g1g59k2t2qcgm"], // England / FA Cup
  ["잉리그컵", "725gd73msyt08xm76v7gkxj7u"], // England / League Cup — 카라바오컵
  ["잉슈퍼컵", "dqr4zpn4l9x9br1c5qv1fb6v9"], // England / Community Shield
  ["독일FA컵", "486rhdgz7yc0sygziht7hje65"], // Germany / Cup — DFB 포칼
  ["이탈FA컵", "6694fff47wqxl10lrd9tb91f8"], // Italy / Cup — 코파 이탈리아
  ["프랑FA컵", "3n9mk5b2mxmq831wfmv6pu86i"], // France / Cup — 쿠프 드 프랑스
  ["프슈퍼컵", "1nsu863daf68kns4l7ou69orf"], // France / Super Cup — 트로페 데 샹피옹
  ["네슈퍼컵", "a9z1becy13xwjmcu8d6mhm66s"], // Holland / Super Cup — 요한 크루이프 실드
  ["에레디비", "akmkihra9ruad09ljapsm84b3"], // Holland / Eredivisie
  ["엘리테세", "9ynnnx1qmkizq1o3qr3v0nsuk"], // Norway / eliteserien — 소문자 주의
  ["K리그1", "avs3xposm3t9x1x2vzsoxzcbu"], // South Korea / K-League — 동명 2건 — 실측 경기에 쓰인 id 채택
  ["K리그2", "b73zounsynk9d3u1p9nvpu7i2"], // South Korea / K-League 2
  ["한국FA컵", "df1o8phtfy4dwhv6n7mmeedvw"], // South Korea / FA Cup
  ["J1리그", "8o5tv5viv4hy1qg9jp94k7ayb"], // Japan / J1 League
  ["J2리그", "5z8v4mj6cjs9ex6hdrpourjzh"], // Japan / J2 League
  ["J1백년", "1okgv7alq5gggbccv5r9p63v8"], // Japan / J1 100 Year Vision League
  ["J2J3백년", "6nju5p3dc3gpz1wp7vpi56pzo"], // Japan / J2/J3 100 Year Vision League
  ["MLS", "287tckirbfj9nb8ar2k9r60vn"], // USA / MLS
  ["미국FA컵", "2bmwykmdlcc2u1c40ytoc39vy"], // USA / Open Cup
  ["ACLE", "1fedahp0rws09tj451onten8r"], // Asia / AFC Champions League
  ["ACL2", "e6vzdkz6l236s9p288mharefy"], // Asia / AFC Champions League 2
  ["축ASEA챔", "8dxsd8xnjm9n1ogo37yomgl3p"], // Asia / ASEAN Championship
  ["A리그", "xwnjb1az11zffwty3m6vn8y6"], // Australia / A League
  ["호주FA컵", "2rdrisk4vlglfjxwu0precyqd"], // Australia / FFA Cup
  ["코파리베", "59tpnfrwnvhnhzmnvfyug68hj"], // South America / Libertadores Cup
  ["C챔피언", "e6rl4hongahbihxd3tpudespd"], // North/Central America / CONCACAF Champions League
])

export function lfaLeagueId(betmanLeagueCode: string | null | undefined): string | null {
  if (!betmanLeagueCode) return null
  return LFA_LEAGUE_IDS.get(betmanLeagueCode) ?? null
}

/** LFA 리그 id → betman league_code (역방향 조회) */
export const BETMAN_CODE_BY_LFA_ID: ReadonlyMap<string, string> = new Map(
  [...LFA_LEAGUE_IDS].map(([code, id]) => [id, code])
)
