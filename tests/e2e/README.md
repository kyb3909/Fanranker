# E2E 사용자 저니 검증 시스템

`docs/user-journeys.md`(13역할 / 62저니) 기반으로, 봇이 모든 저니를 병렬·반복
실행하며 **UI + DB 기록 + 에러 로그**를 종합 검증한다.

## 동작 방식

- **봇**: Clerk Backend API 로 생성(`setup/bot-factory.ts`). 로그인은 sign-in
  token(ticket)으로 — 프로덕션 sign-up CAPTCHA / 새 기기 이메일 2차 인증을 우회.
  봇은 여전히 실제 id+password 계정.
- **격리**: 앱은 포트 **3100**에서 실행, **로컬 Supabase** + **Clerk 개발
  인스턴스**를 바라봄. 사용자의 `.env.local` 은 건드리지 않음 (`webServer.env`
  주입). 전용 환경 파일을 검증한 뒤에만 실행하며 DB 대상은 로컬로 제한한다.
  테스트 빌드는 **`.next-e2e`** / `tsconfig.e2e.json`을 사용해 일반 `.next`를 덮어쓰지 않는다.
- **시드**: 100% 합성(`setup/seed.ts`) — 프로필·카테고리·게시글·댓글 +
  admin 봇(bot01) + betman 경기 + 월드컵 이벤트.
- **검증**: 데이터 변경 저니는 4단계 — UI 액션 → UI 검증 → **DB 검증** → 부가 영향.
- **반복**: `E2E_REPEAT`회(기본 10) × 10봇 병렬 → race condition·누적 상태 버그 포착.

## 사전 준비

1. Docker와 Supabase CLI가 설치되어 있어야 한다. 로컬 Docker에서 이 저장소의
   Supabase를 기동한다(`supabase start`, project `community`). API 포트는 `54321`,
   DB 컨테이너는 `supabase_db_community`이다. 원격 Docker 컨텍스트는 거부한다.
2. `.env.e2e.example`을 `tests/e2e/.env.e2e`로 복사해 아래 **5개 값을 모두** 채운다.
   이 파일은 Git에서 제외된다. `.env` / `.env.local` / 상속된 키로 누락값을 채우지 않는다.

   - `NEXT_PUBLIC_SUPABASE_URL`: `http://127.0.0.1:54321` (`localhost`, `[::1]`도 허용)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: 로컬 공개키 (`sb_publishable_*` 또는 로컬 JWT)
   - `SUPABASE_SERVICE_ROLE_KEY`: 로컬 서비스키 (`sb_secret_*` 또는 로컬 JWT)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: `pk_test_*`
   - `CLERK_SECRET_KEY`: 같은 Clerk 개발 인스턴스의 `sk_test_*`

3. `supabase/config.toml`의 Clerk 신뢰 domain과 개발 인스턴스가 일치하는지 확인한다.
4. `pnpm test:e2e:check`로 읽기 전용 사전 점검을 통과시킨다. 설정 검증, 로컬 Docker의
   `profiles` 읽기, 로컬 REST 읽기만 실행한다. 봇 계정 생성·시드·삭제는 하지 않는다.

사전 점검은 전체 테스트의 **빌드 전**, 봇 생성·비밀번호 재설정 전, DB 시드 전에 자동으로
실행된다. 준비가 안 되면 즉시 종료한다. `pk_test_` / `sk_test_` 검사는 운영키 혼용을
차단하며, Clerk API에서 키 유효성이나 두 키의 인스턴스 일치까지 인증하는 검사는 아니다.

## 실행

```bash
pnpm test:e2e:check               # 읽기 전용 환경·DB 준비 점검
pnpm test:e2e --list              # 테스트 목록만 (준비 점검/계정 생성 없음)
pnpm test:e2e                      # 전체 (기본 10회 반복)
E2E_REPEAT=1 pnpm test:e2e         # 빠른 스모크 (1회)
pnpm test:e2e --grep "글 작성"      # 특정 저니만
pnpm test:e2e:report               # 결과 → reports/summary.md 정리
pnpm test:e2e:cleanup              # Clerk 봇 계정 삭제
```

환경변수: `E2E_REPEAT`(반복수), `E2E_BOT_COUNT`(봇수, 기본 10),
`E2E_KEEP_BOTS=1`(teardown 시 봇 유지).

위 실행 제어 변수는 셸 환경변수로 지정한다. `.env.e2e`에서는 위 5개 연결값만 읽는다.
정리·로그인 토큰 명령도 전용 파일과 개발키를 검증하지만, DB가 중단된 뒤에도 계정을
정리할 수 있도록 DB 가동 여부는 요구하지 않는다. 실패한 설정을 우회하는 옵션은 없다.

일반 빌드 산출물과 tsconfig는 분리했지만 Next가 생성하는 `next-env.d.ts`는 공유된다.
같은 체크아웃에서 일반 앱과 E2E의 빌드를 동시에 실행하지 않는다. 완전한 파일 격리가
필요하면 별도 체크아웃을 사용한다. 기존 `bots.json`에 의존하는 저니 목록 구성과 현재
제품 흐름에 맞지 않는 옛 저니는 별도 정비 대상이다.

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
