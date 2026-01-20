# 커뮤니티 프로젝트 태스크 관리

> 마지막 업데이트: 2026-01-15

---

## 📋 목차

1. [완료된 태스크](#-완료된-태스크)
2. [QA 테스트 결과](#-qa-테스트-결과)
3. [진행 필요 태스크](#-진행-필요-태스크)
4. [태스크 우선순위 매트릭스](#-태스크-우선순위-매트릭스)

---

## ✅ 완료된 태스크

### Phase 1: oEmbed 시스템 구현

| ID | 태스크 | 상태 | 완료일 |
|----|--------|------|--------|
| DONE-001 | TipTap Embed Node 구현 (`embed.ts`) | ✅ 완료 | 2026-01-07 |
| DONE-002 | TipTap EmbedPaste 확장 구현 (URL 자동 감지) | ✅ 완료 | 2026-01-07 |
| DONE-003 | `/api/oembed` 라우트 핸들러 구현 | ✅ 완료 | 2026-01-07 |
| DONE-004 | EmbedCard 컴포넌트 (상세 페이지용) | ✅ 완료 | 2026-01-07 |
| DONE-005 | EmbedPreviewCard 컴포넌트 (피드용 경량) | ✅ 완료 | 2026-01-07 |
| DONE-006 | EmbedRenderer (TipTap NodeView) | ✅ 완료 | 2026-01-07 |
| DONE-007 | Supabase 스키마 설계 (posts, embeds 테이블) | ✅ 완료 | 2026-01-07 |
| DONE-008 | TipTap JSON에서 임베드 추출 유틸리티 | ✅ 완료 | 2026-01-07 |

### Phase 2: TipTap 에디터 개선

| ID | 태스크 | 상태 | 완료일 |
|----|--------|------|--------|
| DONE-009 | SSR Hydration Mismatch 해결 (`immediatelyRender: false`) | ✅ 완료 | 2026-01-07 |
| DONE-010 | TipTap 툴바 구현 (굵게, 기울임, 밑줄, 취소선, 코드) | ✅ 완료 | 2026-01-07 |
| DONE-011 | 텍스트 정렬 기능 추가 (왼쪽, 가운데, 오른쪽) | ✅ 완료 | 2026-01-07 |
| DONE-012 | 제목 스타일 (H1, H2, H3) | ✅ 완료 | 2026-01-07 |
| DONE-013 | 목록 (글머리 기호, 번호 매기기) | ✅ 완료 | 2026-01-07 |
| DONE-014 | 인용구 및 구분선 | ✅ 완료 | 2026-01-07 |
| DONE-015 | Placeholder 확장 통합 | ✅ 완료 | 2026-01-07 |

### Phase 3: 댓글 시스템

| ID | 태스크 | 상태 | 완료일 |
|----|--------|------|--------|
| DONE-016 | 댓글 작성 기능 | ✅ 완료 | 2026-01-07 |
| DONE-017 | 대댓글 작성 기능 | ✅ 완료 | 2026-01-07 |
| DONE-018 | 무한 깊이 대댓글 (재귀 컴포넌트) | ✅ 완료 | 2026-01-07 |
| DONE-019 | 깊이별 시각적 구분 (들여쓰기 제한 5레벨) | ✅ 완료 | 2026-01-07 |

### Phase 4: 글쓰기 및 저장

| ID | 태스크 | 상태 | 완료일 |
|----|--------|------|--------|
| DONE-020 | 글쓰기 페이지 TipTap 에디터 통합 | ✅ 완료 | 2026-01-07 |
| DONE-021 | `/api/posts` POST 라우트 구현 | ✅ 완료 | 2026-01-07 |
| DONE-022 | 글 작성 후 커뮤니티 페이지 리다이렉트 | ✅ 완료 | 2026-01-07 |
| DONE-023 | 이미지 업로드 UI | ✅ 완료 | 2026-01-07 |
| DONE-024 | 이미지 필드 API 연동 | ✅ 완료 | 2026-01-07 |

### Phase 5: 데이터 일관성

| ID | 태스크 | 상태 | 완료일 |
|----|--------|------|--------|
| DONE-025 | 메인 피드 ↔ 상세 페이지 MOCK_POSTS 일원화 | ✅ 완료 | 2026-01-07 |
| DONE-026 | 피드에서 이미지/임베드 썸네일 표시 연동 | ✅ 완료 | 2026-01-07 |

### Phase 6: Clerk + Supabase 인증 시스템 통합

| ID | 태스크 | 상태 | 완료일 |
|----|--------|------|--------|
| DONE-027 | Clerk 패키지 설치 및 기본 설정 | ✅ 완료 | 2026-01-15 |
| DONE-028 | ClerkProvider 래핑 (app/layout.tsx) | ✅ 완료 | 2026-01-15 |
| DONE-029 | Clerk Middleware 설정 (middleware.ts) | ✅ 완료 | 2026-01-15 |
| DONE-030 | Header에 Clerk 인증 컴포넌트 통합 | ✅ 완료 | 2026-01-15 |
| DONE-031 | Supabase + Clerk Third-Party Auth 통합 코드 | ✅ 완료 | 2026-01-15 |
| DONE-032 | Supabase 마이그레이션 파일 준비 (profiles, posts 테이블) | ✅ 완료 | 2026-01-15 |
| DONE-033 | Supabase Third-Party Auth 설정 (Clerk Provider 추가) | ✅ 완료 | 2026-01-15 |
| DONE-034 | Clerk + Supabase 환경변수 설정 (.env) | ✅ 완료 | 2026-01-15 |
| DONE-035 | Supabase 마이그레이션 실행 (SQL Editor) | ✅ 완료 | 2026-01-15 |
| DONE-036 | 프로필 자동 생성 로직 (ensure-profile.ts, ProfileSync) | ✅ 완료 | 2026-01-15 |
| DONE-037 | 글 작성 시 user_id 연동 (app/api/posts/route.ts) | ✅ 완료 | 2026-01-15 |
| DONE-038 | 글 목록 DB 연동 (GET /api/posts, app/page.tsx) | ✅ 완료 | 2026-01-15 |
| DONE-039 | 글 상세 페이지 DB 연동 (GET /api/posts/[id], app/post/[id]/page.tsx) | ✅ 완료 | 2026-01-15 |
| DONE-040 | 검색 기능 구현 (/search 페이지) | ✅ 완료 | 2026-01-15 |
| DONE-041 | 검색 API 구현 (GET /api/search, 타입별 검색) | ✅ 완료 | 2026-01-15 |
| DONE-042 | 댓글 DB 저장 (comments 테이블 + GET/POST /api/comments) | ✅ 완료 | 2026-01-15 |
| DONE-043 | 투표 DB 저장 (post_votes 테이블 + POST /api/posts/[id]/vote) | ✅ 완료 | 2026-01-15 |
| DONE-044 | 이미지 Storage 업로드 (POST /api/upload/image + Supabase Storage) | ✅ 완료 | 2026-01-15 |
| DONE-045 | TipTap underline 중복 제거 (StarterKit 구성 확인) | ✅ 완료 | 2026-01-15 |
| DONE-046 | 알림 시스템 구현 (notifications + user_follows 테이블, API, UI) | ✅ 완료 | 2026-01-15 |
| DONE-047 | 사이버 토큰 시스템 DB 스키마 (user_tokens, token_transactions) | ✅ 완료 | 2026-01-15 |
| DONE-048 | 일일 토큰 리셋 로직 (Cron API + PostgreSQL 함수) | ✅ 완료 | 2026-01-15 |
| DONE-049 | 토큰 잔액 조회/소모 API (GET /api/tokens/balance, POST /api/tokens/spend) | ✅ 완료 | 2026-01-15 |
| DONE-050 | 종목별 조합 제약 로직 (락인 검증 + 베팅 슬립 UI) | ✅ 완료 | 2026-01-15 |
| DONE-051 | 예측 결과 정산 시스템 (정산 API + matches.is_settled 필드) | ✅ 완료 | 2026-01-15 |
| DONE-052 | 수익률 기반 랭킹 계산 (통계 업데이트 로직 + profit/roi 필드 + 랭킹 API) | ✅ 완료 | 2026-01-15 |
| DONE-053 | 전문가 인증 시스템 (필드 추가 + 인증 API + 전문가 목록 API + 뱃지) | ✅ 완료 | 2026-01-15 |
| DONE-054 | 분석 기반 콘텐츠 생성 (전문가 전용 analysis_text 필드 + API 검증) | ✅ 완료 | 2026-01-15 |
| DONE-055 | 사용자 프로필 페이지 구현 (프로필 헤더 + 통계 + 탭 + 팔로우 기능) | ✅ 완료 | 2026-01-15 |
| DONE-056 | 정보 구독 시스템 (구독/구매 테이블 + 구독/구매 API + 접근 제어) | ✅ 완료 | 2026-01-15 |
| DONE-057 | 24시간 이내 경기 필터링 (API 검증 + UI 비활성화 + 안내 문구) | ✅ 완료 | 2026-01-15 |

---

## 🔍 QA 테스트 결과

### 정상 작동 기능 ✅

| 기능 | 테스트 결과 |
|------|-------------|
| 홈페이지 로드 | ✅ Pass |
| 게시물 상세 페이지 네비게이션 | ✅ Pass |
| 댓글 작성 | ✅ Pass |
| 대댓글 작성 | ✅ Pass |
| 글쓰기 폼 (TipTap 에디터) | ✅ Pass |
| 게시판 선택 드롭다운 | ✅ Pass |
| 글 작성 후 리다이렉트 | ✅ Pass |
| 탐색 페이지 | ✅ Pass |
| 커뮤니티 페이지 | ✅ Pass |
| 추천 버튼 (투표) | ✅ Pass |
| 공유 메뉴 (X, Facebook, KakaoStory, LINE, Discord, Instagram) | ✅ Pass |
| 링크 복사 | ✅ Pass |
| 팔로우/언팔로우 | ✅ Pass |
| 정렬 버튼 (온도순/최신순/댓글순) | ✅ Pass |

### 발견된 이슈 ❌

| Issue ID | 기능 | 문제 상황 | 심각도 |
|----------|------|-----------|--------|
| QA-001 | 무료 회원가입 버튼 | 클릭 시 DOM 변화 없음, 네비게이션 없음 | P0 |
| QA-002 | 로그인 링크 | 클릭 불가 (버튼/링크가 아닌 텍스트) | P0 |
| QA-003 | 헤더 검색 기능 | Enter 입력 시 검색 동작 없음 | P1 |
| QA-004 | 알림 버튼 | 클릭 시 DOM 변화 없음 | P2 |
| QA-005 | 사용자 프로필 버튼 | 클릭 시 DOM 변화 없음 | P1 |
| QA-006 | TipTap underline 확장 | 콘솔 경고: 중복 확장 이름 | P2 |
| QA-007 | 글 작성 후 목록 반영 | Supabase 미연동으로 임시 저장만 됨 | P0 |

---

## 📝 진행 필요 태스크

### 🔴 P0 - Critical (즉시 필요)

| ID | 태스크 | 설명 | 예상 복잡도 | 의존성 |
|----|--------|------|-------------|--------|
| TODO-001 | Clerk + Supabase 환경변수 설정 | ✅ 완료 - `.env` 파일 설정 완료 | - | DONE-034 |
| TODO-002 | Supabase 마이그레이션 실행 | ✅ 완료 - SQL Editor에서 마이그레이션 실행 완료 | - | DONE-035 |
| TODO-003 | 프로필 자동 생성 로직 | ✅ 완료 - `ensure-profile.ts` 및 `ProfileSync` 컴포넌트 구현 완료 | - | DONE-036 |
| TODO-004 | 글 작성 시 user_id 연동 | ✅ 완료 - `app/api/posts/route.ts`에서 `user_id: userId` 연동 완료 | - | DONE-037 |

### 🟡 P1 - High (단기 필요)

| ID | 태스크 | 설명 | 예상 복잡도 | 의존성 |
|----|--------|------|-------------|--------|
| TODO-007 | 검색 기능 구현 | ✅ 완료 - `/search` 페이지 + 검색 타입 선택 (닉네임/ID/제목/제목+내용) | - | DONE-040 |
| TODO-008 | 검색 API 구현 | ✅ 완료 - `/api/search` 엔드포인트 (타입별 검색 지원) | - | DONE-041 |
| TODO-009 | 사용자 프로필 드롭다운 | ✅ 완료 - Header에 Clerk SignedIn/SignedOut 컴포넌트 사용 중 | - | DONE-030 |
| TODO-010 | 글 목록 실시간 반영 | ✅ 완료 - Supabase에서 글 목록 fetch 후 표시 | - | DONE-038 |
| TODO-011 | 글 상세 페이지 DB 연동 | ✅ 완료 - 동적으로 Supabase에서 글 데이터 조회 | - | DONE-039 |

### 🟢 P2 - Medium (중기)

| ID | 태스크 | 설명 | 예상 복잡도 | 의존성 |
|----|--------|------|-------------|--------|
| TODO-012 | TipTap underline 중복 제거 | ✅ 완료 - StarterKit 구성 확인 및 정리 | - | DONE-045 |
| TODO-013 | 알림 시스템 설계 | ✅ 완료 - 알림 테이블 + UI 드롭다운 (댓글/답글/새 글 알림) | - | DONE-046 |
| TODO-014 | 댓글 DB 저장 | ✅ 완료 - 댓글/대댓글 Supabase 연동 (comments 테이블 + API) | - | DONE-042 |
| TODO-015 | 투표 DB 저장 | ✅ 완료 - 추천/비추천 Supabase 연동 (post_votes 테이블 + 중복 방지) | - | DONE-043 |
| TODO-016 | 이미지 Supabase Storage 업로드 | ✅ 완료 - base64 대신 Storage URL 사용 (POST /api/upload/image) | - | DONE-044 |

### 🔵 P3 - Low (장기)

| ID | 태스크 | 설명 | 예상 복잡도 | 의존성 |
|----|--------|------|-------------|--------|
| TODO-017 | TikTok oEmbed 지원 | ❌ 취소 - 불필요 | - | - |
| TODO-018 | 사용자 프로필 페이지 | ✅ 완료 - `/profile/[id]` 페이지 구현 (PRED-009에서 구현) | - | DONE-055 |
| TODO-019 | 팔로우 상태 영속화 | ✅ 완료 - user_follows 테이블 + API 구현 완료 | - | DONE-046 |
| TODO-020 | 다크 모드 토글 | ❌ 취소 - 불필요 | - | - |
| TODO-021 | 북마크 기능 | ✅ 완료 - 북마크 테이블 + API + UI 버튼 | - | DONE-047 |

---

## 🎯 PRD 구현 태스크 (예측 시스템)

> 자세한 내용은 `PRD_IMPLEMENTATION_TASKS.md` 참고

### 🔴 P0 - MVP Core (진행 중)

| ID | 태스크 | 상태 | 설명 | 예상 시간 |
|----|--------|------|------|-----------|
| PRED-001 | 사이버 토큰 시스템 DB 스키마 | ✅ 완료 | `user_tokens`, `token_transactions` 테이블 생성 | 2h |
| PRED-002 | 일일 토큰 리셋 로직 | ✅ 완료 | Cron API + PostgreSQL 함수 | 3h |
| PRED-003 | 토큰 잔액 조회/소모 API | ✅ 완료 | `GET /api/tokens/balance`, `POST /api/tokens/spend` | 4h |
| PRED-004 | 종목별 조합 제약 | ✅ 완료 | 클라이언트/서버 검증 로직 + UI 표시 | 3h |
| PRED-005 | 예측 결과 정산 | ✅ 완료 | 정산 API + `is_settled` 필드 추가 | 5h |
| PRED-006 | 수익률 기반 랭킹 | ✅ 완료 | 통계 계산 로직 + 랭킹 API + profit/roi 필드 | 6h |
| PRED-007 | 전문가 인증 시스템 | ✅ 완료 | 전문가 필드 + 인증 API + 뱃지 컴포넌트 | 4h |
| PRED-008 | 분석 기반 콘텐츠 생성 (전문가 전용) | ✅ 완료 | analysis_text 필드 + 전문가 전용 검증 로직 | 3h |
| PRED-009 | 사용자 프로필 페이지 | ✅ 완료 | 프로필 페이지 + 통계 카드 + 팔로우 API | 5h |
| PRED-010 | 정보 구독 시스템 | ✅ 완료 | 구독/구매 테이블 + API (토큰 기반) | 8h |
| PRED-011 | 24시간 이내 경기 필터링 | ✅ 완료 | API 검증 + UI 비활성화 + 안내 문구 | 2h |
| PRED-012 | 베팅 페이지 DB 연동 (mock 데이터 제거) | ✅ 완료 | 구독 피드/랭킹/예측 히스토리 모두 API 연동 완료 | 4h |
| PRED-013 | 관리자 대시보드 구현 | ✅ 완료 | 관리자 필드 + 전문가 승인 페이지 + 기본 구조 | 10h |
| PRED-014 | 실시간 알림 시스템 (전문가 피드) | ✅ 완료 | 전문가 예측 알림 타입 추가 + API 연동 | 3h |
| DONE-058 | 북마크 기능 구현 | ✅ 완료 | 북마크 테이블 + API + UI 버튼 | 3h |

---

## 📊 태스크 우선순위 매트릭스

```
긴급도 ↑
         │
    P0   │  ✅ 모두 완료
(Critical)│  (환경변수, 마이그레이션, 프로필 생성, 글 작성 연동)
         │
    P1   │  TODO-007 ~ TODO-011
  (High) │  (검색, 프로필, 실시간 반영)
         │
    P2   │  TODO-012 ~ TODO-016
(Medium) │  (알림, 댓글 DB, 이미지 최적화)
         │
    P3   │  TODO-017 ~ TODO-021
  (Low)  │  (추가 기능, 개선사항)
         │
         └──────────────────────────→ 복잡도
              Low    Medium    High
```

---

## 🔄 권장 진행 순서

### Week 1: 기반 인프라 ✅ 완료
```
✅ TODO-001: Supabase 환경변수 설정
✅ TODO-002: DB 테이블 생성 (마이그레이션 실행)
✅ TODO-003: 프로필 자동 생성 로직
✅ TODO-004: 글 작성 user_id 연동
```

### Week 2: 인증 시스템 ✅ 완료
```
✅ DONE-027 ~ DONE-037: Clerk + Supabase 통합 완료
✅ TODO-009: 사용자 프로필 드롭다운 완료
```

### Week 3: 핵심 기능 연동
```
✅ TODO-010: 글 목록 DB 연동 완료
✅ TODO-011: 글 상세 페이지 DB 연동 완료
1. TODO-014: 댓글 DB 저장
2. TODO-015: 투표 DB 저장
```

### Week 4: 검색 및 부가 기능
```
12. TODO-007: 검색 페이지 구현
13. TODO-008: 검색 API 구현
14. TODO-015: 투표 DB 저장
15. TODO-016: 이미지 Storage 업로드
```

---

## 📁 관련 파일 구조

```
community/
├── app/
│   ├── api/
│   │   ├── oembed/route.ts          ✅ 완료
│   │   ├── posts/route.ts           ✅ 완료
│   │   └── search/route.ts          ❌ 미구현
│   │   (로그인/회원가입: Clerk 모달 사용)          ✅ Clerk 통합 완료
│   ├── search/page.tsx              ❌ 미구현
│   └── write/page.tsx               ✅ 완료
├── components/
│   ├── embed-card.tsx               ✅ 완료
│   ├── embed-preview-card.tsx       ✅ 완료
│   ├── tiptap-editor.tsx            ✅ 완료
│   └── tiptap-content.tsx           ✅ 완료
├── lib/
│   ├── supabase/
│   │   ├── server.ts                ✅ 완료 (Clerk 통합)
│   │   ├── client.ts                ✅ 완료 (Clerk 통합)
│   │   └── hooks.ts                 ✅ 완료 (Clerk 통합)
├── hooks/
│   └── use-supabase.ts              ✅ 완료 (Clerk 통합)
├── middleware.ts                    ✅ 완료 (clerkMiddleware)
│   ├── tiptap/extensions/
│   │   ├── embed.ts                 ✅ 완료
│   │   ├── embed-paste.ts           ✅ 완료
│   │   └── embed-renderer.tsx       ✅ 완료
│   └── utils/
│       └── tiptap-embeds.ts         ✅ 완료
└── supabase/migrations/
    ├── 001_create_profiles.sql      ✅ 준비 완료 (실행 필요)
    ├── 002_create_categories_posts.sql ✅ 준비 완료 (실행 필요)
    ├── 20250115_clerk_rls_integration.sql ✅ 준비 완료
    └── MIGRATION_GUIDE.md            ✅ 작성 완료
```

---

## 📌 참고 사항

- **Supabase 프로젝트**: 프로젝트 ID `ekysrlhdrapmsnrkytif` - 마이그레이션 실행 필요
- **인증 방식**: Clerk (Third-Party Auth) + Supabase RLS
  - ✅ Clerk 설정 완료: 도메인 `https://definite-mollusk-7.clerk.accounts.dev`
  - ✅ Supabase Third-Party Auth 설정 완료
- **환경 변수**: `.env` 파일에 Clerk 및 Supabase 키 설정 필요
- **마이그레이션 상태**: 
  - ✅ 파일 준비 완료 (`001_create_profiles.sql`, `002_create_categories_posts.sql`)
  - ⚠️ SQL Editor에서 수동 실행 필요 (MIGRATION_GUIDE.md 참고)
- **이미지 저장**: 현재 base64 → Supabase Storage로 변경 예정
- **검색**: Supabase Full-Text Search 또는 pg_trgm 확장 사용 예정

---

*이 문서는 프로젝트 진행 상황에 따라 지속적으로 업데이트됩니다.*

