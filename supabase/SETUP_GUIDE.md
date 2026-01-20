# Clerk + Supabase Third-Party Auth 설정 가이드

## 현재 문제
Clerk로 회원가입은 되지만 Supabase에 테이블이 없어서 데이터 저장/조회가 안 됨

## 해결 순서

---

## Step 1: Supabase에 테이블 생성

### 1.1 Supabase Dashboard 접속
1. https://supabase.com/dashboard 접속
2. 프로젝트 선택: `ekysrlhdrapmsnrkytif`
3. 좌측 메뉴에서 **SQL Editor** 클릭

### 1.2 Migration 파일 실행
다음 파일들을 **순서대로** SQL Editor에 복사-붙여넣기 후 실행:

1. `migrations/001_create_profiles.sql`
2. `migrations/002_create_categories_posts.sql`

---

## Step 2: Clerk Third-Party Auth 설정

### 2.1 Clerk Dashboard에서 Supabase 연동
1. https://dashboard.clerk.com 접속
2. 좌측 메뉴 → **Integrations** → **Supabase** 클릭
3. **Enable Supabase integration** 클릭
4. Supabase 프로젝트 URL 입력: `https://ekysrlhdrapmsnrkytif.supabase.co`

> 이 설정이 완료되면 Clerk JWT에 자동으로 `role: authenticated` claim이 추가됨

### 2.2 Supabase에서 Clerk Provider 추가
1. https://supabase.com/dashboard 접속
2. 프로젝트 선택 → **Authentication** → **Providers**
3. 스크롤하여 **Third-party Auth** 섹션 찾기
4. **Add new provider** 클릭
5. **Clerk** 선택
6. Clerk JWKS URL 입력:
   ```
   https://definite-mollusk-7.clerk.accounts.dev/.well-known/jwks.json
   ```
   (Clerk Dashboard → API Keys → JWKS URL에서 확인 가능)

---

## Step 3: 기존 Clerk 사용자 프로필 생성

Clerk로 이미 가입한 사용자는 profiles 테이블에 레코드가 없음.
수동으로 생성하거나, 앱에서 자동 생성 로직 추가 필요.

### 3.1 수동 생성 (SQL Editor에서)
```sql
-- Clerk user ID를 확인 후 아래 실행
INSERT INTO profiles (user_id, nickname)
VALUES ('user_xxxxxxxxxxxxx', '내닉네임')
ON CONFLICT (user_id) DO NOTHING;
```

### 3.2 자동 생성 (앱 코드에서)
`hooks/use-supabase.ts` 또는 Server Action에서 프로필 자동 생성 로직 추가
(아래 예시 참조)

---

## Step 4: 연동 테스트

### 4.1 RLS 테스트 (SQL Editor)
```sql
-- 1. 테이블 확인
SELECT * FROM profiles;
SELECT * FROM categories;

-- 2. RLS 정책 확인
SELECT * FROM pg_policies WHERE tablename = 'profiles';
```

### 4.2 앱에서 테스트
1. 브라우저에서 로그인
2. 개발자 도구 → Console에서 Supabase 쿼리 실행
3. profiles 테이블에 자신의 프로필이 있는지 확인

---

## Troubleshooting

### 문제: "permission denied" 오류
- RLS 정책이 제대로 설정되지 않음
- `auth.jwt()->>'sub'`가 null (Clerk 토큰이 전달되지 않음)

### 문제: "JWT 오류"
- Clerk Third-Party Auth 설정이 안 됨
- JWKS URL이 잘못됨

### 문제: "테이블이 없음"
- Migration이 실행되지 않음
- SQL Editor에서 직접 실행 필요

---

## 참고 문서
- [Supabase Third-Party Auth with Clerk](https://supabase.com/docs/guides/auth/third-party/clerk)
- [Clerk Supabase Integration](https://clerk.com/docs/integrations/databases/supabase)
