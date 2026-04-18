# 가오픈 전 체크리스트

**작성일:** 2026-04-19
**대상 도메인:** gongnori.fan (canonical)
**용도:** 배포 직전 10-15분 안에 훑어 빠진 것 없는지 확인
**원칙:** "모르는 것"보다 "놓친 것"이 더 무섭다. 체크 하나라도 미완료면 가오픈 보류.

---

## 0. 최종 배포 직전 (5분)

- [ ] `main` 브랜치가 origin과 동기화 (`git fetch && git status`)
- [ ] 마지막 커밋이 의도한 내용인지 `git log -1` 확인
- [ ] Vercel 대시보드에서 `gongnori.fan` production deployment 상태 **Success**
- [ ] 프리뷰(`*.vercel.app`)가 아닌 `gongnori.fan` DNS 정상 해석:
      ```bash
      curl -sI https://gongnori.fan | head -1
      # HTTP/2 200 기대
      ```

---

## 1. 환경 변수 (Vercel Production)

Vercel 대시보드 → Project → Settings → Environment Variables → Production 탭

### 필수
- [ ] `NEXT_PUBLIC_SUPABASE_URL` (공개)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` (공개)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (비공개, **절대 NEXT_PUBLIC_ 붙이지 말 것**)
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (prod key — `pk_live_` 시작)
- [ ] `CLERK_SECRET_KEY` (`sk_live_` 시작)
- [ ] `CLERK_WEBHOOK_SECRET` (사용자 동기화용)
- [ ] `CRON_SECRET` (Vercel cron이 쓰는 인증 값)

### 서드파티 (사용 중이면)
- [ ] `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_ORG` + `SENTRY_PROJECT` + `SENTRY_AUTH_TOKEN`
- [ ] `PORTONE_API_KEY` + `PORTONE_API_SECRET` (결제)
- [ ] `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET` (뉴스 크롤링)
- [ ] `OPENAI_API_KEY` (news agents)
- [ ] `NEXT_PUBLIC_GA_MEASUREMENT_ID` (GA4)

### 검증 팁
- [ ] **dev key와 prod key 교차 오염 없는지** — prod에 `pk_test_*` 들어가 있으면 대재앙
- [ ] `SUPABASE_SERVICE_ROLE_KEY`가 **NEXT_PUBLIC_ prefix 없이** 저장됐는지 (클라에 노출 금지)
- [ ] lib/env.ts zod 스키마에 새 env 전부 정의됐는지

---

## 2. Supabase 보안 (RLS)

공격자 관점에서: 누군가 supabase anon key로 직접 쿼리 날리면 어디까지 노출?

- [ ] Supabase Dashboard → Authentication → Policies 에서 **모든 테이블** RLS **Enabled** ✓
- [ ] 예측/포스트/댓글 테이블의 INSERT 정책: `user_id = auth.uid()` 강제
- [ ] SELECT 정책: 개인정보 테이블(`profiles`의 이메일/전화)은 본인만
- [ ] service_role 사용 경로 감사:
      ```bash
      grep -rn "createServiceRoleClient\|SUPABASE_SERVICE_ROLE_KEY" app/ lib/ | head -20
      ```
      → 클라이언트 번들엔 없어야 함. `lib/supabase/admin.ts`, `lib/supabase/server.ts` 서버 경로에만.
- [ ] admin API 라우트 전부 `requireAdminApi()` 체크 확인:
      ```bash
      grep -rn "from \"@/lib/admin/require-admin-api\"" app/api/admin/
      # 5개 파일 이상 나와야 함
      ```

---

## 3. Vercel Cron 상태

Vercel Dashboard → Cron Jobs 확인

- [ ] 등록된 크론 목록과 `vercel.json`의 `crons` 배열 일치
- [ ] 최근 실행 상태 (대시보드 Runs 탭) 모두 **Success**
- [ ] 만약 cron이 외부로 호출하는 라우트가 있으면 `verifyCronSecret` 작동 확인:
      ```bash
      curl -sS -w "\nHTTP %{http_code}\n" https://gongnori.fan/api/cron/betman-sync
      # 401 기대 (secret 없이 호출)
      curl -sS -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $CRON_SECRET" https://gongnori.fan/api/cron/betman-sync
      # 200 기대
      ```
- [ ] Vultr 서울 VPS의 `/opt/betman/sync.sh` cron 정상 동작 (`ssh root@<IP>` → `tail -20 /opt/betman/sync.log`)

---

## 4. Rate Limiting

- [ ] `lib/rate-limit.ts` 의 `RATE_LIMITS` 값 검토 (사용자 관점에서 불편하지 않은지):
      ```bash
      grep -A 10 "RATE_LIMITS" lib/rate-limit.ts
      ```
- [ ] 주요 POST 라우트 `checkRateLimit()` 적용 상태:
      ```bash
      grep -L "checkRateLimit" app/api/comments/route.ts app/api/posts/route.ts app/api/follow/route.ts app/api/betman/prediction/route.ts
      # 출력이 비어 있어야 함 (전부 적용)
      ```
- [ ] 어뷰징 방어 팁: 테스트 계정으로 실제 공격 패턴 1회 → 429 받는지 확인

---

## 5. Sentry

- [ ] Sentry 프로젝트 대시보드 접속 가능
- [ ] 테스트 에러 발생 시 수신:
      ```bash
      curl -sS https://gongnori.fan/api/_sentry-test 2>/dev/null  # 없으면 skip
      ```
- [ ] Sentry → Alerts → Rules 에 **신규 이슈 발생 시 Slack/이메일** 설정
- [ ] traces sample rate (5-10%) 적절, 비용 폭주 안 함
- [ ] Replay 샘플 rate: 에러 시 100%, 일반 세션 0% (비용 제어)

---

## 6. DB 백업

- [ ] Supabase Dashboard → Project → Database → Backups 활성 확인
- [ ] Point-in-Time Recovery (PITR) 유료 티어 사용 중이면 보관일 체크
- [ ] 백업 없으면 **pg_dump 수동 한 번**이라도 받아두기:
      ```bash
      # Supabase Dashboard에서 DB URL 복사 후 로컬에서
      PGPASSWORD=<pw> pg_dump -h <host> -U postgres -F c -f backup_$(date +%Y%m%d).dump
      ```

---

## 7. SEO / Open Graph

- [ ] `https://gongnori.fan/robots.txt` → User-agent/Allow/Sitemap 정상
- [ ] `https://gongnori.fan/sitemap.xml` → 주요 페이지 나열
- [ ] 포스트 공유 미리보기 (카카오톡/트위터):
      ```bash
      # 카톡 OG 크롤러 시뮬레이션
      curl -sS -A "Mozilla/5.0 (compatible; Kakaotalk-Scrap/1.0;)" https://gongnori.fan/post/<id> | grep -E 'og:(title|description|image)' | head -5
      ```
- [ ] Google Search Console → 속성 등록 + 소유 인증
- [ ] Naver 서치어드바이저 → 사이트 등록

---

## 8. 분석 / 트래킹

- [ ] GA4 측정 ID 작동 (`NEXT_PUBLIC_GA_MEASUREMENT_ID`)
- [ ] Vercel Analytics 대시보드 정상
- [ ] Supabase realtime 연결 한도 파악 (Free 플랜 2개 채널/동접, 가오픈 규모 고려)

---

## 9. 성능 최종 확인

- [ ] Lighthouse 모바일 Performance ≥ 70 (homepage)
- [ ] Core Web Vitals 전부 "Good":
      - LCP < 2.5s
      - INP < 200ms
      - CLS < 0.1
- [ ] `.gstack/benchmark-reports/2026-04-19-benchmark.md` 대비 회귀 없음

---

## 10. 법적 / 정책

- [ ] `/terms` 이용약관 2026 최신
- [ ] `/privacy` 개인정보처리방침 최신
- [ ] `/content-policy` 게시물 운영정책 최신
- [ ] 쿠키 배너 (EU 타겟이면 필수, 한국만이면 생략 가능)
- [ ] 14세 미만 이용 제한 조항 (COPPA)
- [ ] 개인정보처리방침에 열거된 수집 항목과 실제 DB 필드 일치

---

## 11. 모니터링 대시보드

배포 직후 30분간 띄워두고 볼 것:

- [ ] **Vercel Dashboard** → Runtime Logs (실시간)
- [ ] **Sentry Issues** → New (오늘 날짜 필터)
- [ ] **Supabase Logs** → Postgres (오류 급증?)
- [ ] **Vercel Analytics** → Realtime visitors

---

## 12. Soft Launch 전략 (강력 추천)

- [ ] 가족/친구 5-10명에게 먼저 링크 전송
- [ ] 48시간 관찰 기간
- [ ] 문제 없으면 SNS/커뮤니티에 공식 공개
- [ ] 공개 후 첫 1시간 대시보드 **풀스크린** 모니터링
- [ ] 첫 Sentry 신규 이슈 = 즉시 분석 (30분 룰)

---

## 13. 롤백 계획

문제 터지면 어떻게 원상복구?

- [ ] Vercel Dashboard → Deployments → 이전 성공한 배포 찾아 **Promote to Production** 방법 숙지 (30초 이내 롤백)
- [ ] DB 스키마 변경이 포함된 배포는 마이그레이션 rollback SQL 사전 준비
- [ ] 심각한 어뷰징 탐지 시 `/api/admin/users/[userId]/role` 로 해당 유저 즉시 차단 가능한지 admin 계정 접근권 확인

---

## 14. 가오픈 후 첫 24시간 체크

- [ ] Sentry 신규 이슈 개수 (보통 < 5개면 건강)
- [ ] 500 에러 비율 (전체 요청 대비 0.1% 이하)
- [ ] 응답 시간 p95 < 2초 유지
- [ ] 최초 진입자 1명 이상 가입 성공
- [ ] 첫 글 작성 1건 이상 발생 (안 되면 회원가입→작성 플로우 체크)
- [ ] 첫 댓글/투표 발생

---

## 통과 기준

1~9번 전부 ✓, 10~11번 확인, 12~14번 계획 수립. 하나라도 **?** 면 가오픈 보류하고 원인 해결.

완료 서명:
- 점검자: ________________
- 일시: ________________
- 비고: ________________
