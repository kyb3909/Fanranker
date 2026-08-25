---
name: gongnori-e2e
description: Playwright 테스트를 쓰거나 돌릴 때 쓴다. e2e/ · tests/e2e/journeys/ · tests/audit/ 아래 spec 을 만들거나 고칠 때, "pnpm test:e2e", "pnpm audit", "playwright test" 를 실행할 때, 브라우저로 화면 동작을 검증할 때, 로그인 유저 여정을 테스트할 때, 프로덕션 사이트를 크롤해 회귀를 찾을 때.
allowed-tools: Read, Edit, Write, Grep, Bash
---

# Playwright — 설정이 셋이다

**섞으면 안 된다.** testDir·포트·목적이 전부 다르다. 어느 것을 쓸지 먼저 정하고
이유를 말한 다음 실행한다.

| 설정 | testDir | 무엇 |
|---|---|---|
| `playwright.config.ts` | `e2e/` | 스모크·회귀. 5 projects (chromium/firefox/webkit/Mobile Chrome/Mobile Safari), ko-KR / Asia/Seoul |
| `playwright.e2e.config.ts` | `tests/e2e/journeys/` | guest·member·admin 여정 |
| `playwright.audit.config.ts` | `tests/audit/` | 프로덕션 BFS 크롤 + UI 관찰 |

## 1. 스모크 (`e2e/`)

```bash
pnpm exec playwright test e2e/home.spec.ts --project=chromium
BASE_URL=https://gongnori.fan pnpm exec playwright test   # 외부 URL — webServer 스킵
```

⚠️ `BASE_URL` 없이 돌리면 `webServer` 가 **`pnpm dev` 를 3000 포트에** 띄운다.
이 기계에서 **3000 은 다른 프로젝트(ax) 것**이다. 로컬 대상이면 `BASE_URL` 을 주거나
3002 로 띄워 두고 `BASE_URL=http://localhost:3002` 로 붙일 것.

## 2. 여정 (`tests/e2e/journeys/`)

```bash
pnpm test:e2e            # 실행
pnpm test:e2e:report     # 리포트
pnpm test:e2e:cleanup    # 봇 정리
```

**격리가 이 설정의 존재 이유다.** 포트 3100 + `tests/e2e/.env.e2e` 의 로컬 Supabase 로
돌아서 `pnpm dev` 와도 프로덕션과도 안 부딪힌다. 이 격리를 깨는 수정을 하지 말 것.

- 로그인 유저는 봇 팩토리(Clerk sign-in token)로 만들고 `globalSetup`/`globalTeardown`
  이 치운다.
- `next build && next start` 로 띄운다 — 워커 10개 부하를 Turbopack 이 못 버틴다.

## 3. 감사 (`tests/audit/`)

```bash
pnpm audit           # headed, 30~45분
pnpm audit:headless
pnpm audit:cwv       # Core Web Vitals
pnpm audit:diff      # 직전 두 run 비교
```

**프로덕션을 실제로 돌아다닌다.** 삭제·탈퇴·결제·로그아웃 키워드는 안전장치가
막지만, 새 spec 을 넣을 때 그 안전장치를 우회하지 말 것. 산출물은
`tests/audit/reports/{ts}/` (gitignored).

## 공통

- 실패를 보면 먼저 **어느 설정으로 돌렸는지** 확인한다. 잘못된 설정으로 돌린
  실패가 진짜 회귀처럼 보인다.
- 로케일은 ko-KR / Asia/Seoul. 날짜·숫자 단언을 쓸 때 기계 로케일을 가정하지 말 것.
