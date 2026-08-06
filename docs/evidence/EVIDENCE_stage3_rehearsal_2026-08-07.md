# EVIDENCE — 단계 3 리허설: 유럽 예선 경기 데이터 추출 (2026-08-07)

- 지시: 오너 "유럽대회 예선 위주로 테스트 — 확실히 데이터가 있어서. K리그·친선은 데이터가 없을 수도"
- 방법: 매핑 완료된 UCL 예선 4경기(전부 종료·betman 스코어 보유 = 정답지)를 로컬 Playwright(headless)로 열어 추출 가능 데이터 전수 조사 + betman 교차 검증
- 판정: **통과** — 교차 검증 3/3 일치, 단계 3 크롤러 스펙 확정 재료 확보

## 교차 검증 (soccerway 렌더 데이터 vs betman 정산 데이터)

| 경기 | betman | soccerway | 일치 |
|---|---|---|---|
| 페네르바흐체 v 슈투름 (8/5) | 2:0 | 2-0 FULL-TIME | ✅ |
| 위니옹 SG v 보되 글림트 (8/4) 풀타임 | 3:3 | 3-3 FULL-TIME | ✅ |
| 위니옹 SG v 보되 글림트 **전반전 마켓** | 2:2 | **1ST HALF 2-2** | ✅ (전반 마켓 정산 대조 가능 실증) |

## 추출 가능 데이터 전수 (MATCH 탭 1페이지 + LINEUPS 서브탭)

| 항목 | 실측 예 (페네르-슈투름) | 비고 |
|---|---|---|
| 스코어·하프별 | 2-0 (1ST 2-0 / 2ND 0-0) | FULL-TIME 상태 표기 |
| 득점 + 도움 | 9' Talisca (Akturkoglu), 45' Greenwood (Asensio) | 페널티는 `(Penalty)`, 추가시간 `45+4'` 표기 (보되전 실측) |
| 카드 + 사유 | 21' Gorenc Stankovic (Roughing), 65' Kayombo (Diving) | |
| 교체 + 시각 + 사유 | 30' Brown↔Oosterwolde (Injury) | |
| 포메이션 | 4-2-3-1 vs 4-4-2 | |
| 선발 11 + 등번호 + (G)/(C) | 34 Gunok (G), 37 Skriniar (C) … | |
| **선수 개인 평점** | Talisca **8.4**, Ake 7.6, 팀 7.5 vs 6.1 | ⚠️ 경기별 편차 — 보되전엔 PLAYER STATS 탭 없음 → **optional 필드** |
| 벤치 전원·감독 | SUBSTITUTES 24명, COACHES Kartal/Ingolitsch | |
| 팀 스탯 | xG 1.38-0.16, 점유율 72-28, 슛 17-5, 빅찬스, 박스터치 | |
| 경기 정보 | 심판 Kavanagh (Eng), 경기장, 수용 47,430 / 관중 39,800 | |
| 리포트 기사(영문) | "Fener out in front…" 전문 | D14: 외부 텍스트 발행 금지 — 참고 신호로만 |

## 구조 확정 사실 (크롤러 스펙)

1. **mid 불필요** — 종료 경기는 `/match/{a}/{b}/` 접근 시 `/report/`로 자동 이동, 라인업은 탭 클릭 → `/summary/lineups/` (경로 기반, `?mid=` 구시대 전제 폐기. 단 `/lineups/` 직행은 404 — SPA 탭 전환 필요).
2. **headless 필수 재확인** — 종료 경기도 정적 fetch 에는 스코어·라인업 없음 (JS 번들 문자열만).
3. 데이터는 innerText 수준에서 이미 구조적(분/선수/사유 라인 패턴) — DOM 셀렉터 파싱으로 안정화 예정.
4. **소커웨이 자체 선수 평점 존재** — D-4(평점 소스) 결정 재료 갱신: 1차 팬 평점(자체) + 2차 soccerway 평점(수집, optional) 병기 가능.

## 매핑 보강 (이번 리허설에서 함께)

- 러너에 `lookbackHours` 옵션 추가 (백필·리허설용) — 종료된 UCL 4경기 소급 매핑 완료 (위니옹-보되는 URL 순서 뒤집혀도 canonical 로 접힘 실증).
- 96h 스윕 누적: proposed +52행. 미해결은 축월드컵 국가대표·"미정" 플레이스홀더·일부 MLS — 유럽·K리그 클럽 축구는 전량 해소.

## 다음 (단계 3 본작업)

1. 경기 데이터 테이블 5종 마이그 (fixtures/lineups/appearances/match_events/player_ratings — 실측 필드 기준으로 설계)
2. 위 스펙의 추출기(Playwright)를 스크립트로 고정 — 로컬 수동 실행부터 (VPS 배치는 오너 승인 후)
3. 8/11-12 UCL 2차전이 첫 라이브 리허설 후보 (이미 매핑돼 있음)
