# Clerk Authentication Integration Guide

이 프로젝트는 **Clerk 최신 베스트 프랙티스 (2026)**를 따라 구성되었습니다.

## 📋 목차

1. [개요](#개요)
2. [설치 및 설정](#설치-및-설정)
3. [환경 변수](#환경-변수)
4. [파일 구조](#파일-구조)
5. [사용법](#사용법)
6. [Clerk + Supabase 통합](#clerk--supabase-통합)
7. [보호된 라우트](#보호된-라우트)
8. [서버 사이드 인증](#서버-사이드-인증)
9. [문제 해결](#문제-해결)

---

## 개요

이 프로젝트는 **Clerk**와 **Supabase**를 함께 사용합니다:
- **Clerk**: 사용자 인증 및 세션 관리
- **Supabase**: 데이터베이스 및 추가 백엔드 기능

## 설치 및 설정

### 1. 패키지 설치 ✅

```bash
npm install @clerk/nextjs@latest
```

> **참고**: React 19.x를 사용하는 경우 `--legacy-peer-deps` 플래그가 필요할 수 있습니다.

### 2. Clerk 대시보드 설정

1. [Clerk Dashboard](https://dashboard.clerk.com/)에서 프로젝트 생성
2. **API Keys** 페이지에서 키 복사
3. 환경 변수에 키 추가

---

## 환경 변수

`.env` 파일에 다음 변수를 추가하세요:

```env
# Clerk Configuration
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
CLERK_SECRET_KEY=YOUR_SECRET_KEY
```

**중요**:
- `YOUR_PUBLISHABLE_KEY`와 `YOUR_SECRET_KEY`를 실제 키로 교체하세요
- Clerk 대시보드의 [API Keys](https://dashboard.clerk.com/last-active?path=api-keys)에서 확인 가능
- `.env` 파일은 절대 Git에 커밋하지 마세요

---

## 파일 구조

```
community/
├── app/
│   └── layout.tsx                    ✅ ClerkProvider 래핑
├── middleware.ts                     ✅ Clerk + Supabase 통합
├── components/
│   └── clerk-auth-example.tsx        ✅ 인증 컴포넌트 예시
└── .env                              ✅ 환경 변수
```

---

## 사용법

### 1. 기본 인증 컴포넌트

Clerk는 다음과 같은 즉시 사용 가능한 컴포넌트를 제공합니다:

```tsx
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs'

export function Header() {
  return (
    <header>
      <SignedOut>
        {/* 로그인하지 않은 사용자에게만 표시 */}
        <SignInButton />
        <SignUpButton />
      </SignedOut>

      <SignedIn>
        {/* 로그인한 사용자에게만 표시 */}
        <UserButton />
      </SignedIn>
    </header>
  )
}
```

### 2. 현재 사용자 정보 가져오기

#### Client Component

```tsx
'use client'

import { useUser } from '@clerk/nextjs'

export function ProfileComponent() {
  const { isSignedIn, user, isLoaded } = useUser()

  if (!isLoaded) return <div>로딩 중...</div>
  if (!isSignedIn) return <div>로그인이 필요합니다</div>

  return <div>안녕하세요, {user.firstName}님!</div>
}
```

#### Server Component

```tsx
import { auth, currentUser } from '@clerk/nextjs/server'

export default async function ProfilePage() {
  // 방법 1: userId만 가져오기
  const { userId } = await auth()

  // 방법 2: 전체 사용자 객체 가져오기
  const user = await currentUser()

  if (!userId) {
    return <div>로그인이 필요합니다</div>
  }

  return <div>안녕하세요, {user?.firstName}님!</div>
}
```

### 3. Route Handler (API Routes)

```tsx
// app/api/protected/route.ts
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  return NextResponse.json({ message: '보호된 데이터', userId })
}
```

### 4. Server Actions

```tsx
'use server'

import { auth } from '@clerk/nextjs/server'

export async function createPost(formData: FormData) {
  const { userId } = await auth()

  if (!userId) {
    throw new Error('인증 필요')
  }

  // 게시물 생성 로직
  return { success: true, userId }
}
```

---

## Clerk + Supabase 통합

이 프로젝트는 Clerk와 Supabase를 함께 사용합니다.

### Middleware 통합

`middleware.ts`는 두 서비스를 모두 처리합니다:

```typescript
import { clerkMiddleware } from '@clerk/nextjs/server'
import { createServerClient } from '@supabase/ssr'

export default clerkMiddleware(async (auth, req) => {
  // 1. Clerk 인증 처리
  // 2. Supabase 세션 갱신
  // 3. 쿠키 관리
})
```

### 사용자 동기화 (선택사항)

Clerk 사용자를 Supabase 데이터베이스에 동기화하려면:

```tsx
// app/api/sync-user/route.ts
import { auth, currentUser } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const { userId } = await auth()
  const user = await currentUser()
  const supabase = await createClient()

  if (!userId || !user) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  // Supabase에 사용자 정보 저장
  const { error } = await supabase
    .from('users')
    .upsert({
      clerk_id: userId,
      email: user.emailAddresses[0]?.emailAddress,
      name: `${user.firstName} ${user.lastName}`,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

---

## 보호된 라우트

### Middleware에서 라우트 보호

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/admin(.*)',
  '/profile(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect()
  }

  // Supabase 처리...
})
```

### 페이지에서 직접 보호

```tsx
// app/dashboard/page.tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return <div>대시보드 내용</div>
}
```

---

## 서버 사이드 인증

### ✅ 권장 방법

```tsx
import { auth, currentUser } from '@clerk/nextjs/server'

// 방법 1: userId만 필요한 경우
const { userId } = await auth()

// 방법 2: 전체 사용자 정보 필요한 경우
const user = await currentUser()
```

### ❌ 피해야 할 패턴

```tsx
// ❌ 서버에서 useUser() 사용 금지 (클라이언트 훅임)
const { user } = useUser() // 에러!
```

---

## 문제 해결

### 1. "Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()"

**원인**: `middleware.ts`에서 `clerkMiddleware()`를 사용하지 않음

**해결**:
```typescript
// middleware.ts
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware()
```

### 2. React 버전 충돌

**증상**: `peer dependency` 에러

**해결**:
```bash
npm install @clerk/nextjs --legacy-peer-deps
```

### 3. 환경 변수가 로드되지 않음

**확인 사항**:
- `.env` 파일이 프로젝트 루트에 있는지 확인
- `NEXT_PUBLIC_` 접두사가 붙어 있는지 확인 (클라이언트용)
- 개발 서버를 재시작했는지 확인

### 4. Middleware가 작동하지 않음

**확인 사항**:
- `middleware.ts` 파일이 `app/` 폴더와 같은 레벨에 있는지 확인
- `export const config` matcher가 올바른지 확인

---

## 📚 추가 리소스

- [Clerk 공식 문서](https://clerk.com/docs)
- [Clerk Next.js 퀵스타트](https://clerk.com/docs/nextjs/getting-started/quickstart)
- [Clerk 컴포넌트 레퍼런스](https://clerk.com/docs/components/overview)
- [Clerk + Next.js App Router](https://clerk.com/docs/nextjs)

---

## ✅ 설정 체크리스트

- [x] `@clerk/nextjs` 패키지 설치
- [x] 환경 변수 설정 (`.env`)
- [x] `middleware.ts`에 `clerkMiddleware()` 적용
- [x] `app/layout.tsx`에 `<ClerkProvider>` 래핑
- [x] Clerk + Supabase 통합
- [ ] Clerk Dashboard에서 프로젝트 생성
- [ ] 실제 API 키를 `.env`에 입력
- [ ] 헤더에 인증 컴포넌트 추가
- [ ] 보호된 라우트 설정 (선택사항)
- [ ] 사용자 동기화 구현 (선택사항)

---

**마지막 업데이트**: 2026-01-15
**Clerk 버전**: @clerk/nextjs@latest (2026)
**Next.js 버전**: 16.0.3 (App Router)
