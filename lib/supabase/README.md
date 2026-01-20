# Supabase Integration Guide

이 프로젝트는 **Supabase 2026 최신 베스트 프랙티스**를 따라 구성되었습니다.

## 📁 파일 구조

```
lib/supabase/
├── client.ts      # 브라우저 클라이언트 (Client Components)
├── server.ts      # 서버 클라이언트 (Server Components, Route Handlers)
└── README.md      # 이 파일

middleware.ts      # 인증 토큰 자동 갱신
```

## 🔑 환경 변수

`.env` 또는 `.env.local` 파일에 다음 변수를 설정하세요:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

## 📖 사용법

### 1. Server Components (서버 컴포넌트)

```typescript
import { createClient } from '@/lib/supabase/server'

export default async function ServerComponent() {
  const supabase = await createClient()

  const { data: posts } = await supabase
    .from('posts')
    .select('*')

  return <div>{/* 렌더링 */}</div>
}
```

### 2. Client Components (클라이언트 컴포넌트)

```typescript
'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function ClientComponent() {
  const [data, setData] = useState(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase.from('posts').select('*')
      setData(data)
    }
    fetchData()
  }, [])

  return <div>{/* 렌더링 */}</div>
}
```

### 3. Route Handlers (API 라우트)

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase.from('posts').select('*')
  return NextResponse.json(data)
}
```

### 4. Server Actions

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'

export async function createPost(formData: FormData) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('posts')
    .insert({ title: formData.get('title') })

  if (error) throw error
  return data
}
```

## 🔒 인증 (Authentication)

### 사용자 인증 확인

**❌ 서버에서 절대 사용하지 마세요:**
```typescript
// 보안 위험! getSession()은 서버에서 사용 금지
const { data: { session } } = await supabase.auth.getSession()
```

**✅ 서버에서는 항상 getUser() 사용:**
```typescript
// 올바른 방법
const { data: { user }, error } = await supabase.auth.getUser()

if (error || !user) {
  // 인증되지 않음
}
```

### 보호된 라우트 예시

**middleware.ts에 추가:**
```typescript
const { data: { user } } = await supabase.auth.getUser()

if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
  return NextResponse.redirect(new URL('/login', request.url))
}
```

## 🔄 Middleware 역할

`middleware.ts`는 다음 작업을 자동으로 수행합니다:

1. **토큰 갱신**: 만료된 인증 토큰을 자동으로 새로고침
2. **쿠키 업데이트**: 갱신된 토큰을 쿠키에 저장
3. **세션 유지**: Server Components가 항상 유효한 세션을 받도록 보장

**중요**: Middleware가 없으면 사용자가 예기치 않게 로그아웃될 수 있습니다!

## 📚 참고 문서

- [Supabase Next.js 공식 가이드](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [서버 사이드 인증 설정](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase 클라이언트 생성](https://supabase.com/docs/guides/auth/server-side/creating-a-client)

## ✅ 체크리스트

- [x] `@supabase/ssr` 패키지 설치
- [x] 환경 변수 설정 (`.env` 또는 `.env.local`)
- [x] `lib/supabase/client.ts` 생성
- [x] `lib/supabase/server.ts` 생성
- [x] `middleware.ts` 생성
- [ ] Supabase 프로젝트 생성 및 테이블 마이그레이션
- [ ] 로그인/회원가입 페이지 구현
- [ ] 인증 상태 관리 (Context/Provider)

## 🚀 다음 단계

1. **Supabase 대시보드**에서 테이블 생성:
   ```sql
   -- supabase/migrations/create_posts_with_embeds.sql 실행
   ```

2. **인증 페이지** 구현:
   - `/app/login/page.tsx`
   - `/app/signup/page.tsx`

3. **글 목록 DB 연동**:
   - 기존 MOCK_POSTS를 Supabase 쿼리로 교체

---

**마지막 업데이트**: 2026-01-15
**Supabase 버전**: @supabase/ssr (최신)
