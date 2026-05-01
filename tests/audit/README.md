# Full App Audit Harness

`gongnori.fan` 사이트 전체를 로그인 상태로 BFS 크롤하면서 콘솔/네트워크/페이지 에러 수집 + UI/UX 관찰을 모은다.
사이클을 반복하면서 이슈를 좁혀가는 게 운영 모델.

## 빠른 시작

```bash
# 1. .env.local 에 자격증명 (.gitignore 등록됨)
echo "AUDIT_EMAIL=..." >> .env.local
echo "AUDIT_PASSWORD='...'" >> .env.local   # 특수문자(#, $) 있으면 작은따옴표

# 2. 풀 audit 실행 (브라우저 창 떠서 30~60분 — 다른 작업 가능)
pnpm audit

# 3. 직전 두 run 자동 비교 + health.json 누적
pnpm audit:diff
```

`pnpm audit`은 `BASE_URL`을 `playwright.audit.config.ts`의 default(`https://gongnori.fan`)로 사용.
다른 환경 대상이면 `BASE_URL=https://staging.gongnori.fan pnpm audit`.

## 산출물

```
tests/audit/reports/
├── health.json                     ← 사이클별 점수 누적 (compare-runs가 갱신)
└── 2026-05-02T03-00-00/            ← per-run 디렉토리 (timestamp)
    ├── audit-events.jsonl          모든 이벤트 raw (콘솔/네트워크/페이지에러/UI 관찰)
    ├── audit-report.md             (선택) 사람용 리포트 — Claude 가 작성하거나 수동
    ├── menu-inventory.json         헤더/사이드바/푸터/사용자 드롭다운에서 추출한 링크
    ├── visited-urls.json           BFS 가 실제 방문한 path + 상태
    ├── run-meta.json               시작/종료 시각, MAX_PAGES, quick 모드 여부
    ├── trace.zip                   Playwright trace (재생 가능)
    └── screenshots/                풀페이지 스크린샷 (desktop + mobile)
```

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `BASE_URL` | `https://gongnori.fan` | audit 대상 도메인 |
| `AUDIT_EMAIL` | — | 로그인용. `.env.local` 에 |
| `AUDIT_PASSWORD` | — | 로그인용. 특수문자 있으면 작은따옴표 |
| `AUDIT_MAX_PAGES` | `100` | BFS 큐 최대 |
| `AUDIT_QUICK` | `0` | `1` 이면 스크린샷 생략 + MAX_PAGES=10 |

## 안전장치 (spec 내부)

다음 키워드 매칭 요소는 **클릭 안 함**: 삭제 / 탈퇴 / 결제 / 구매 / 청구 / 로그아웃 / 차단 / 신고 / 환불 + 영문 동의어.
폼은 안전한 검색/필터 정도만 입력 후 일부 제출.
외부 도메인 진입 시 자동 복귀.

## 사이클 운영 모델

```
┌─────────────────┐      ┌──────────────┐      ┌─────────────┐
│ pnpm audit      │ ───► │ pnpm audit:  │ ───► │ Claude 가   │
│  (Playwright    │      │   diff       │      │ issues 검토 │
│   BFS 크롤)     │      │ resolved /   │      │ → 코드 수정 │
└────────┬────────┘      │  newly /     │      └──────┬──────┘
         ▲               │  regressed   │             │
         │               └──────────────┘             │
         └─────── 다음 사이클 ◄───────────────────────┘
```

`compare-runs.ts` 가 **regressed** (이번에 새로 생긴 critical/major) 를 강조 — 수정한 게 다른 곳을 깨뜨렸는지 확인.

## 이슈 카테고리 / 심각도 매핑

`tests/audit/lib/parse-events.ts` 에서 결정. 요약:

| 카테고리 | 심각도 |
|---|---|
| `fatal` (audit 자체 실패) | critical |
| `pageerror` (unhandled JS exception) | critical |
| 5xx response | critical |
| 4xx response (whitelist 외) | major |
| `nav_error` (페이지 로드 실패) | major |
| `console:error` | major |
| `console:warning` | minor |
| `requestfailed` (광고/GA 외) | minor |
| `ui_*` (UI 관찰: layout/a11y/touch_target) | severity 그대로 (high/medium/low → major/minor/info) |

화이트리스트 (정상으로 무시):
- `clerk.com/v1/...` 4xx (인증 체크 정상 동작)
- `/api/*/check`, `/api/auth/me` 4xx (미인증 체크)
- google-analytics, googleads, doubleclick, adtrafficquality 의 abort

## Audit 자체의 알려진 한계

1. **submit이 destructive로 간주되는 폼은 fill만 됨** — 글쓰기/댓글 등은 로직 자체는 안 검증
2. **OAuth 경로 미사용** — 이메일/비번만
3. **권한별 페이지 분리 안 함** — admin 권한 진입 안 시도
4. **dynamic 라우트 표본** — `/post/{id}` 같은 곳은 메인 피드에서 link 추출되는 표본만 방문

## 새 사이클 돌리기 전 체크리스트

- [ ] 직전 사이클의 `audit-report.md` 읽음
- [ ] regressed 이슈 0건 (있으면 우선 수정)
- [ ] persisting issues 중 가장 임팩트 큰 것 1~3개 픽
- [ ] 코드 수정 후 `pnpm audit:headless` (headed 안 띄워도 됨, 더 빠름)
- [ ] `pnpm audit:diff` 로 결과 비교
- [ ] resolved/newly 기준으로 PR 작성

## Claude Code 와 함께 운영하는 패턴

```
사용자: "audit 한 번 더 돌리고 새 이슈 있으면 고쳐줘"
Claude:
  1. pnpm audit:headless
  2. pnpm audit:diff
  3. regressed 0 확인 + persisting 중 우선순위 픽
  4. 코드 수정
  5. 다시 1~3 반복
  6. 사이클 완료 시 한국어 5줄 요약 + 다음 사이클 추천
```
