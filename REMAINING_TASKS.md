# 🔴 미완료 작업 목록

> **최종 업데이트**: 2026-01-15

---

## ✅ 완료 확인 (이미 구현됨)

### TODO-018: 사용자 프로필 페이지
- ✅ `/profile/[id]/page.tsx` 파일 존재 확인
- ✅ PRED-009에서 구현 완료
- **상태**: 이미 완료됨 (TASK.md 업데이트 필요)

### TODO-019: 팔로우 상태 영속화
- ✅ `user_follows` 테이블 존재 (`005_create_user_follows.sql`)
- ✅ `/api/users/[id]/follow` API 구현 완료
- ✅ `components/user-profile-header.tsx`에서 팔로우 기능 사용 중
- **상태**: 이미 완료됨 (TASK.md 업데이트 필요)

---

## ✅ 모든 작업 완료!

### 🔵 P3 - Low Priority

#### **TODO-021: 북마크 기능** ✅ 완료
**목표**: 사용자가 관심 있는 글을 북마크하여 나중에 쉽게 찾을 수 있게 함

**필요 작업**:
1. `bookmarks` 테이블 생성
   - `id` (uuid)
   - `user_id` (text, FK → profiles.user_id)
   - `post_id` (uuid, FK → posts.id)
   - `created_at`
   - UNIQUE 제약: (user_id, post_id)
2. 북마크 API 구현
   - `POST /api/posts/[id]/bookmark` - 북마크 추가/삭제 (토글)
   - `GET /api/posts/[id]/bookmark` - 북마크 상태 확인
   - `GET /api/bookmarks` - 사용자의 북마크 목록 조회
3. UI 구현
   - `components/post-card.tsx`에 북마크 버튼 추가
   - `components/post-detail-content.tsx`에 북마크 버튼 추가
   - 북마크 목록 페이지 (선택사항)

**파일**:
- `supabase/migrations/015_create_bookmarks.sql` (신규)
- `app/api/posts/[id]/bookmark/route.ts` (신규)
- `app/api/bookmarks/route.ts` (신규)
- `components/post-card.tsx` (수정)
- `components/post-detail-content.tsx` (수정)

**예상 시간**: 3-4시간

---

### 🔵 P3 - Low Priority (PRD)

#### **PRED-013: 관리자 대시보드 구현**
**목표**: 경기 관리, 전문가 승인, 정산 처리 등 관리 기능 제공

**상태**: ✅ 완료 (기본 구조)
- `profiles.is_admin` 필드 추가 완료
- Middleware에서 `/admin/*` 경로 보호 완료
- `/admin` 메인 대시보드 페이지 완료
- `/admin/experts` 전문가 승인 페이지 완료 (전체 기능 구현)
- `/admin/matches`, `/admin/settlements`, `/admin/tokens` 기본 페이지 생성 (추후 확장 가능)

**파일**:
- ✅ `supabase/migrations/017_add_admin_field.sql`
- ✅ `lib/supabase/admin.ts` (관리자 권한 체크 헬퍼)
- ✅ `app/admin/page.tsx`
- ✅ `app/admin/experts/page.tsx` + `expert-approval-table.tsx`
- ✅ `app/admin/matches/page.tsx` (기본 구조)
- ✅ `app/admin/settlements/page.tsx` (기본 구조)
- ✅ `app/admin/tokens/page.tsx` (기본 구조)
- ✅ `middleware.ts` (수정)
- ✅ `app/api/admin/users/certify-expert/route.ts` (관리자 권한 체크 추가)

**참고**: matches, settlements, tokens 페이지는 기본 구조만 있으며, 추후 실제 기능 구현 가능

---

#### **PRED-014: 실시간 알림 시스템 (전문가 피드)**
**목표**: 팔로우한 전문가가 새 예측을 올리면 실시간 알림

**상태**: ✅ 완료
- `notifications` 테이블에 `type = 'expert_prediction'` 추가 완료
- `POST /api/prediction` API에 팔로워 알림 생성 로직 추가 완료
- `components/notification-dropdown.tsx`에 전문가 예측 알림 표시 추가 완료

**파일**:
- ✅ `supabase/migrations/016_add_expert_prediction_notification.sql`
- ✅ `app/api/prediction/route.ts` (수정 완료)
- ✅ `components/notification-dropdown.tsx` (수정 완료)

**참고**: Supabase Realtime 구독은 향후 필요 시 추가 가능

---

## 📊 요약

| 우선순위 | 태스크 ID | 제목 | 예상 시간 | 상태 |
|---------|----------|------|-----------|------|
| P3 | TODO-021 | 북마크 기능 | 3-4h | ✅ 완료 |
| P3 | PRED-013 | 관리자 대시보드 구현 | 10h | ✅ 완료 (기본) |
| P3 | PRED-014 | 실시간 알림 시스템 (전문가 피드) | 3h | ✅ 완료 |

**총 미완료 작업**: 0개  
**모든 주요 기능 구현 완료!** 🎉

---

## 🎉 최종 업데이트 (2026-01-15)

### 관리자 대시보드 기능 추가
- ✅ `/admin/settlements` - 정산 처리 페이지 구현 완료
- ✅ `/admin/tokens` - 토큰 모니터링 페이지 구현 완료  
- ✅ `/admin/matches` - 경기 관리 페이지 구현 완료
- ✅ 관리자 전용 API 엔드포인트 추가 (`/api/admin/tokens/balances`, `/api/admin/matches/list`)

---

## 📝 참고사항

### 이미 완료되었지만 TASK.md에 미반영
- **TODO-018**: 사용자 프로필 페이지 (`/profile/[id]/page.tsx` 존재, PRED-009에서 구현)
- **TODO-019**: 팔로우 상태 영속화 (`/api/users/[id]/follow` API 존재)

### 구현 완료된 주요 기능
- ✅ 모든 P0 태스크 (환경 설정, 마이그레이션, 프로필 생성)
- ✅ 모든 P1 태스크 (검색, 프로필, 글 목록/상세)
- ✅ 모든 P2 태스크 (알림, 댓글, 투표, 이미지 업로드)
- ✅ 모든 PRD P0-P1 태스크 (토큰 시스템, 정산, 랭킹, 전문가, 구독 등)

---

**프로젝트 상태**: ✅ **모든 기능 구현 완료**

모든 태스크가 완료되었으며, 관리자 대시보드까지 전체 기능이 구현되었습니다.
