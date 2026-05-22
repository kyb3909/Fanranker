# E2E 사용자 저니 검증 시스템

`docs/user-journeys.md`(13역할 / 62저니) 기반으로, 봇이 모든 저니를 병렬·반복
실행하며 **UI + DB 기록 + 에러 로그**를 종합 검증한다.

## 동작 방식

- **봇**: Clerk Backend API 로 생성(`setup/bot-factory.ts`). 로그인은 sign-in
  token(ticket)으로 — 프로덕션 sign-up CAPTCHA / 새 기기 이메일 2차 인증을 우회.
  봇은 여전히 실제 id+password 계정.
- **격리**: 앱은 포트 **3100**에서 실행, **로컬 Supabase** + **Clerk 개발
  인스턴스**를 바라봄. 사용자의 `.env.local` 은 건드리지 않음 (`webServer.env`
  주입). 모든 봇 활동은 로컬 DB 에만 기록 — 프로덕션 무오염.
- **시드**: 100% 합성(`setup/seed.ts`) — 프로필·카테고리·게시글·댓글 +
  admin 봇(bot01) + betman 경기 + 월드컵 이벤트.
- **검증**: 데이터 변경 저니는 4단계 — UI 액션 → UI 검증 → **DB 검증** → 부가 영향.
- **반복**: `E2E_REPEAT`회(기본 10) × 10봇 병렬 → race condition·누적 상태 버그 포착.

## 사전 준비

1. Docker Desktop 실행 + 로컬 Supabase 기동: `pnpm exec supabase start`
2. `tests/e2e/.env.e2e` — 로컬 Supabase 키 + Clerk **개발 인스턴스** 키
   (`pk_test_`/`sk_test_`). `.gitignore` 처리됨.

## 실행

```bash
pnpm test:e2e                      # 전체 (기본 10회 반복)
E2E_REPEAT=1 pnpm test:e2e         # 빠른 스모크 (1회)
pnpm test:e2e --grep "글 작성"      # 특정 저니만
pnpm test:e2e:report               # 결과 → reports/summary.md 정리
pnpm test:e2e:cleanup              # Clerk 봇 계정 삭제
```

환경변수: `E2E_REPEAT`(반복수), `E2E_BOT_COUNT`(봇수, 기본 10),
`E2E_KEEP_BOTS=1`(teardown 시 봇 유지).

## 구조

```
tests/e2e/
  setup/      bot-factory(.ts/-cli.ts), seed.ts, global-setup/teardown.ts
  helpers/    auth.ts(ticket 로그인), db-verifier.ts, error-collector.ts,
              journey.ts(REPEAT+finishJourney), fixtures.ts
  journeys/   guest/ · member/ · admin/  (역할별 spec)
  fixtures/   bots.json (gitignored)
  reports/    results.json, summary.md (gitignored)
```

신규 저니 추가: 해당 역할 폴더에 `*.spec.ts`. 헬퍼·패턴은 기존 spec 참고.
