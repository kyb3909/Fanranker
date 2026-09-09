# 코덱스 작업 지시 — 베트맨 발매 예단 규칙으로 LFA 전용 경기 등록 좁히기 (2026-09-10)

## 배경

`lib/match/get-fixtures.ts` `getFixturesForDay` 는 베트맨 일정을 정본으로 두고 LFA 일정을 보강한다. 베트맨에 없는 경기 중 **인기팀 14팀**(`lib/match/popular-teams.ts`)이 뛰는 경기는 `lib/match/supplemental-fixtures.ts` `syncSupplementalFixtures` 가 `lfa_fixtures` 에 독립 UUID 로 등록한다(2026-09-02 운영자 예외: 타국 컵대회에서 하부리그 팀과 만나 베트맨이 안 파는 경기도 싣기 위해).

문제: 베트맨은 리그·유럽 대항전 경기를 **경기 당일 아침에야** 발매한다(9/9 실측: 당일 UCL 4경기 08:10 발매). LFA 는 며칠 전부터 일정이 있으므로, 새벽 크론이 "베트맨에 없다"고 보고 리그·대항전 경기까지 LFA 전용 경기로 등록한다(9/9 04:30 바르셀로나–페예노르트·나폴리–아스널·리버풀–아틀레티코·첼시–리즈). 발매 뒤 `betman_game_id` 가 붙지만 코드 규칙상 정체성은 LFA UUID 로 남아(`supplemental-fixtures.ts` 주석 "never replaces the match identity"), MOTM 폴 키가 `lfa_…` 로 생기고 매치 페이지 경로·불변식·점검 스크립트가 베트맨 키와 갈린다.

## 운영자가 정한 규칙 (베트맨 발매 범위)

- 베트맨은 **잉글랜드는 2부(EFL 챔피언십)까지**, 그 외 나라는 **1부만** 베팅을 낸다.
- 따라서 컵대회에서 인기팀 상대가 그 범위 밖 팀이면 그 경기는 베트맨에 **영원히 안 나온다.** 범위 안 팀이면 **당일에 나온다.**
- 리그 경기와 유럽 대항전(UCL·UEL·UECL·UEFA 슈퍼컵)은 항상 나온다(당일 발매).

## 해야 할 것

### 1. 순수 판정 함수 `lib/match/betman-coverage.ts` (server-only 금지, 순수 모듈)

```ts
export type BetmanListing = "will_list" | "never" | "unknown"
export function predictBetmanListing(f: {
  leagueCode: string          // 베트맨 코드 체계 (lib/match/leagues.ts 의 값: "EPL","라리가","분데스리","잉글FA컵","독일FA컵"…)
  homeTeamEn?: string; awayTeamEn?: string
  homeTeam: string; awayTeam: string
}, members: (leagueCode: string) => ReadonlySet<string>): BetmanListing
```

- 리그(`EPL`,`라리가`,`세리에A`,`분데스리`,`프리그1`) → `will_list`
- 유럽 대항전(`UCL`,`UEL`,`UECL`,`U슈퍼컵`) → `will_list`
- 잉글랜드 컵(`잉글FA컵`,`잉리그컵`,`잉슈퍼컵`) → 양 팀이 `EPL ∪ EFL챔` 멤버면 `will_list`, 한 팀이라도 아니면 `never`
- 타국 컵(`스페FA컵`→`라리가`, `이탈FA컵`→`세리에A`, `독일FA컵`→`분데스리`, `프랑FA컵`·`프슈퍼컵`→`프리그1`) → 양 팀이 그 1부 멤버면 `will_list`, 아니면 `never`
- 멤버 목록을 못 얻으면(빈 집합) `unknown`

멤버 대조는 **LFA 영문 원명**(`homeTeamEn`/`awayTeamEn`)으로 한다. 한글 표시명은 사전 상태에 따라 흔들린다.

### 2. 멤버 목록 출처

1순위: `lfa_day_cache` 에 쌓인 LFA 일정에서 리그별로 등장한 팀(영문 원명) 집합을 만든다 — 판정 대상과 같은 표기 체계라 이름 대조가 필요 없다. 2026-27 시즌 시작(8월) 이후 날짜만 쓴다. 헬퍼는 `lib/lfa/` 아래 두고 5분 이상 캐시.
2순위(1순위가 비면): `standings_cache.data` 의 팀명 — 네이버 표기라 `team_dictionary` 로 영문 변환이 필요하다. 대조 실패 팀이 있으면 그 리그는 `unknown`.

### 3. 등록 정책 변경 — `getFixturesForDay`

`missing` 집합을 만드는 자리에서 `predictBetmanListing` 을 적용한다.

| 판정 | 동작 |
|---|---|
| `never` | 지금처럼 즉시 LFA 전용 등록 |
| `will_list` | **등록하지 않는다.** 베트맨 발매를 기다린다. 단 **안전망**: 킥오프까지 2시간 이하로 남았는데도 베트맨에 없으면 그때 등록한다(베트맨이 빠뜨린 경우) |
| `unknown` | `will_list` 와 같게 처리(보수적 — 잘못 등록하는 쪽이 더 나쁘다) + `console.warn` 1줄 |

등록을 미루는 동안에도 그 LFA 행은 **일정 페이지에 실린다**(지금도 `merged` 에 gameId 없이 들어간다). 링크만 없을 뿐이다 — 이 동작은 유지한다.

### 4. 이미 연결된 등록 행의 정체성

이번 작업에서는 바꾸지 않는다. 3번이 적용되면 리그·대항전 경기는 애초에 등록되지 않으므로 대부분 사라진다. 안전망(킥오프 2h 전 등록) 뒤에 베트맨이 발매되는 드문 경우만 남는데, 그건 별도 결정으로 미룬다.

### 5. 기존 데이터 정리 — 실행하지 말고 SQL 만 제시

`lfa_fixtures` 8행이 `betman_game_id` 연결 상태다.
- 오늘 밤 킥오프 4경기(바르셀로나–페예노르트 01:45, 나폴리–아스널·리버풀–아틀레티코·첼시–리즈 04:00): 아직 그 UUID 밑에 불판·폴이 없으면 행을 지워 베트맨 정체성으로 돌릴 수 있다. **삭제 SQL 과 사전 확인 SQL(posts.match_game_id·polls.game_id 조회)을 제시만** 한다. 실행은 운영자.
- 9/7 유베–밀란, 9/9 UCL 3경기: 이미 `lfa_` 키 폴이 있으니 그대로 둔다.

### 6. 테스트 (Vitest)

- 판정 함수: 리그/대항전 → will_list, 잉글랜드 컵 3부 상대 → never, 잉글랜드 컵 2부 상대 → will_list, 독일 포칼 하부리그 상대 → never, 멤버 없음 → unknown.
- 등록 정책: will_list 인 인기팀 경기가 킥오프 24h 전엔 등록되지 않고, 킥오프 90분 전엔 등록된다. never 는 즉시 등록. 기존 등록 행 갱신·연결은 그대로.
- 기존 `__tests__/lib/match/supplemental-fixtures.test.ts` 16개 유지.

### 7. 범위 밖 (하지 말 것)

- 정체성 전환(4번), 운영 DB 쓰기, VPS, `lib/match/pair-fixtures.ts` 짝짓기 규칙 변경(별도 항목), 크론 스케줄 변경.

### 참고 실측 (2026-09-09)

- 발매 시각: 9/10 UCL 4경기 베트맨 `created_at` 09-09 08:10:22. LFA 전용 등록 04:30:42.
- 정당한 LFA 전용(연결 없음): Osnabrück–바이에른(9/3 포칼), HEBC–도르트문트(9/2 포칼), 첼시–Luton(8/28 카라바오, Luton 3부) — 새 규칙에서도 전부 `never` 여야 한다.
