---
name: gongnori-cron
description: 주기 실행 작업을 추가·수정·삭제할 때 쓴다. vercel.json 의 crons 를 만질 때, app/api/cron/ 아래에 새 route.ts 를 만들 때, "매시간 돌게", "하루 한 번", "스케줄", "정기 실행", "배치" 같은 요청이 나올 때. pg_cron 이나 Vultr VPS cron(betman 크롤, 뉴스 스캐너)을 다룰 때도 쓴다.
allowed-tools: Read, Edit, Write, Grep, Bash
---

# 주기 작업 규약

## 1. 먼저: 어느 층인가

층이 **셋**이고 서로 모른다.

| 층 | 자리 | 무엇 |
|---|---|---|
| Vercel Cron | `vercel.json` (36개) | 앱 내부 작업 |
| Vultr VPS cron | 서울 VPS (`/opt/betman/sync.sh`, `/opt/news-scanner`) | betman 크롤·뉴스 스캔 |
| pg_cron | DB 안 (`docs/PG_CRON_JOBS.md`, 6종) | 온도 등 |

**betman 은 Vercel 에 못 올린다** — Vercel 은 해외 IP라 betman.co.kr 에 직접 접근이
안 된다. 그래서 VPS 가 있다. 새 작업이 외부 한국 사이트를 긁는다면 VPS 층이다.

## 2. Vercel cron 이라면

세 가지가 다 있어야 한다.

1. `vercel.json` 의 `crons` 에 `path` + `schedule`
2. `app/api/cron/<name>/route.ts`
3. 그 라우트 안에 **`verifyCronSecret` + `withCronLog`**

`withCronLog` 를 빠뜨리면 `/api/cron/invariant-audit` 의 심박 감시가 **멀쩡히 도는
작업을 죽었다고 헛짚는다.** 로그가 없으면 감시자에게는 안 돈 것과 같다.

기존 라우트를 하나 열어 형태를 그대로 따를 것.

## 3. 시간

`schedule` 은 **UTC** 다. KST 는 +9.
- 매일 밤 11시(KST) → `0 14 * * *`
- 데일리 윈도우는 **전날 23:00 에 넘어간다** — 날짜 경계를 쓰는 작업이면
  `project_betman_daily_window` 규칙을 먼저 확인한다. 새벽 경기가 증발한다.

## 4. 유료 호출이 섞이면

라이브 축구 API(LFA)는 **호출당 크레딧**이다. 주기 작업이 이걸 부르면 빈도 × 30일이
그대로 비용이다. `lfa_usage_log` 가 계기판이다. 사용자 입력이 호출 파라미터로 직결되면
반드시 범위 창을 친다 — `/matches?date=` 가 열려 있어 크롤러가 하루 21,000 크레딧을
태운 적이 있다.
