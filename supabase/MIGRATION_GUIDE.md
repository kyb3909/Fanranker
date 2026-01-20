# Supabase 마이그레이션 가이드

이 가이드는 Clerk + Supabase 통합 프로젝트의 마이그레이션을 올바르게 실행하는 방법을 설명합니다.

## 📋 마이그레이션 실행 순서

**중요**: 마이그레이션은 반드시 아래 순서대로 실행해야 합니다!

### 순서 1: 기본 테이블 생성
1. `001_create_profiles.sql` - profiles 테이블 생성
2. `002_create_categories_posts.sql` - categories와 posts 테이블 생성

### 순서 2: RLS 정책 보완 (선택사항)
3. `20250115_clerk_rls_integration.sql` - embeds 테이블 RLS 및 헬퍼 함수 (embeds 테이블이 있는 경우만)

### 순서 3: 예측 시스템 테이블 (PRD 구현)
4. `007_create_user_tokens.sql` - 사이버 토큰 시스템 (user_tokens, token_transactions) ⭐
5. `009_add_settlement_fields.sql` - 예측 정산 필드 (matches.is_settled) ⭐
6. `010_add_stats_profit_roi_fields.sql` - 통계 필드 추가 (profit, roi, total_tokens_spent) ⭐
7. `011_add_expert_fields.sql` - 전문가 인증 필드 추가 (is_expert, expert_certified_at) ⭐
8. `012_add_prediction_analysis.sql` - 예측 분석 필드 추가 (analysis_text, is_premium, price) ⭐
9. `013_create_subscriptions.sql` - 구독 시스템 테이블 (subscriptions) ⭐
10. `014_create_purchased_content.sql` - 구매 콘텐츠 테이블 (purchased_content) ⭐
11. `015_create_bookmarks.sql` - 북마크 테이블 (bookmarks) ⭐
12. `016_add_expert_prediction_notification.sql` - 전문가 예측 알림 타입 추가 ⭐
13. `017_add_admin_field.sql` - 관리자 필드 추가 (is_admin) ⭐ 새로 추가

### 순서 3: 참고용 파일 (실행 불필요)
- `20250115_clerk_rls_policies.sql` - 예시 정책 (실행하지 않음)
- `create_posts_with_embeds.sql` - 다른 스키마의 예시 (충돌 가능성 있음, 실행하지 않음)

---

## 🚀 실행 방법

### 방법 1: Supabase SQL Editor에서 수동 실행 (권장)

1. [Supabase Dashboard](https://supabase.com/dashboard) 접속
2. 프로젝트 선택: `ekysrlhdrapmsnrkytif`
3. 좌측 메뉴 → **SQL Editor** 클릭
4. 아래 파일들을 **순서대로** 열어서 복사-붙여넣기 후 **RUN** 클릭:

```
1단계: 001_create_profiles.sql
2단계: 002_create_categories_posts.sql
3단계: 20250115_clerk_rls_integration.sql (embeds 테이블이 있는 경우만)
4단계: 007_create_user_tokens.sql ⭐ 새로 추가
```

### 방법 2: Supabase CLI 사용 (선택사항)

```bash
# Supabase CLI 설치 (없는 경우)
pnpm add -D supabase

# Supabase 프로젝트 연결
supabase link --project-ref ekysrlhdrapmsnrkytif

# 마이그레이션 실행
supabase db push
```

---

## ⚠️ 문제 해결

### "relation already exists" 에러
- 테이블이 이미 존재하는 경우입니다.
- `IF NOT EXISTS` 구문이 있으면 안전하게 건너뜁니다.
- 그래도 에러가 나면 해당 `CREATE TABLE` 문을 `CREATE TABLE IF NOT EXISTS`로 수정하세요.

### "policy already exists" 에러
- RLS 정책이 이미 존재하는 경우입니다.
- `20250115_clerk_rls_integration.sql`은 이미 중복 체크를 하므로 안전합니다.

### "column does not exist" 에러
- 가장 흔한 원인: `author_id` vs `user_id` 충돌
- **해결**: `002_create_categories_posts.sql`에서는 `user_id`를 사용하므로, 다른 파일에서 `author_id`를 참조하면 안 됩니다.
- 이미 수정된 `20250115_clerk_rls_integration.sql`을 사용하세요.

### 마이그레이션 순서가 잘못됨
- 반드시 `001` → `002` → `20250115_clerk_rls_integration` → `007` 순서로 실행하세요.
- `007_create_user_tokens.sql`은 `001_create_profiles.sql`에 의존합니다 (profiles.user_id FK).

---

## ✅ 마이그레이션 확인

마이그레이션 후 다음 쿼리로 확인:

```sql
-- 테이블 확인
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- RLS 정책 확인
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- 데이터 확인
SELECT COUNT(*) FROM profiles;
SELECT COUNT(*) FROM categories;
SELECT COUNT(*) FROM posts;
```

---

## 📝 참고 사항

- `create_posts_with_embeds.sql`는 다른 스키마 구조를 사용하므로 **실행하지 마세요** (충돌 가능)
- `20250115_clerk_rls_policies.sql`는 예시 파일이므로 **실행하지 마세요**
- 실제 사용되는 테이블 구조는 `002_create_categories_posts.sql`에 정의되어 있습니다.

---

**마지막 업데이트**: 2026-01-15

---

## 📋 최신 마이그레이션: 007_create_user_tokens.sql

### 실행 안내

**007_create_user_tokens.sql** 파일을 Supabase SQL Editor에서 실행하세요:

1. Supabase Dashboard → SQL Editor
2. `supabase/migrations/007_create_user_tokens.sql` 파일 내용 복사
3. SQL Editor에 붙여넣기 후 **RUN** 클릭
4. 성공 메시지 확인: `'user_tokens and token_transactions tables created successfully!'`

### 생성되는 내용

- **테이블**: `user_tokens`, `token_transactions`
- **함수**: `reset_user_daily_tokens()`, `ensure_daily_token_reset()`
- **RLS 정책**: 사용자별 토큰 조회/업데이트 권한
- **의존성**: `profiles` 테이블 (001_create_profiles.sql) 필수
