# ArtistHub - 제품 요구사항 정의서 (PRD)

> **버전:** v1.0  
> **작성일:** 2026-02-16  
> **상태:** 프론트엔드 프로토타입 완료 / 백엔드 미연동

---

## 1. 제품 한 줄 정의

**ArtistHub**는 DeviantArt처럼 작품을 전시하고, 크몽처럼 작가에게 커미션을 의뢰하며, Redbubble처럼 완성된 그림으로 굿즈를 프린팅/판매할 수 있는 **"디지털 아트 올인원 커머스 플랫폼"** 이다.

---

## 2. 문제 정의

| 문제 | 설명 |
|------|------|
| 전시/의뢰/판매가 분리됨 | 작가는 DeviantArt, 크몽, Redbubble 등 여러 플랫폼을 동시에 운영해야 함 |
| 커미션 이후 활용 단절 | 커미션이 끝나면 전시/굿즈/2차 수익으로 연결되지 않음 |
| 팬 -> 구매 전환 구조 부족 | 팬이 작품을 봐도 자연스럽게 구매/굿즈로 이어지기 어려움 |
| 작가의 장기 수익 구조 부재 | 대부분 1회성 커미션 수익에 의존 |

---

## 3. 목표

### 3.1 핵심 목표

작가가 **전시 -> 커미션 -> 판매 -> 굿즈 -> 장기 수익**까지 하나의 플랫폼에서 완결되도록 만든다.

팬/의뢰인은:
1. 구경하다가
2. 마음에 들면 의뢰하고
3. 완성작으로 굿즈까지 주문하는 **자연스러운 전환 경험**을 얻는다.

---

## 4. 주요 사용자 정의 (Personas)

### 4.1 작가 (Artist)
- SNS, 커뮤니티, 팬아트 활동 중
- 커미션을 받고 싶고, 굿즈 판매도 관심 있음
- 관리 툴이 흩어지는 것을 싫어함

### 4.2 팬/의뢰인 (Client / Fan)
- 특정 작가 스타일을 좋아함
- 캐릭터, 커플, 굿즈용 그림을 의뢰하고 싶음
- 완성된 그림을 실물 굿즈로 소장하고 싶음

### 4.3 일반 관람자 (Viewer)
- 단순 감상 -> 팔로우 -> 이후 커미션/구매 가능성 있음

---

## 5. 핵심 유저 플로우

### 5.1 작가 플로우
```
회원가입 -> 작가 전환 신청 -> 포트폴리오 업로드
-> 커미션 상품 등록 -> 의뢰 수락 -> 작업 진행
-> 완성작 업로드 -> 전시 + 디지털 판매 + 굿즈 연동
```

### 5.2 의뢰인 플로우
```
작가 탐색 -> 스타일 선택 -> 커미션 의뢰
-> 결제 -> 작업 진행 확인 -> 완성본 수령
-> 디지털 다운로드 or 굿즈 주문 -> 리뷰 작성
```

### 5.3 관람자 플로우
```
갤러리 탐색(Masonry 피드) -> 작품 클릭 -> 작가 프로필 확인
-> 팔로우 or 프린팅 요청 or 커미션 의뢰
```

---

## 6. 핵심 기능 목록 및 구현 현황

### 6.1 전시 기능 (DeviantArt 역할)

| 기능 | 설명 | 구현 상태 |
|------|------|-----------|
| 작가 프로필 페이지 | 포트폴리오/커미션/샵/소개 탭 구조 | 완료 |
| 작품 갤러리 (Explore) | Masonry 레이아웃, 이미지 호버 오버레이 | 완료 |
| 카테고리 필터 | 일러스트/캐릭터 디자인/컨셉 아트/만화/애니메이션/그래픽 디자인 | 완료 |
| 정렬 기능 | Hot / Top(일,주,월,년,전체) / New - 레딧 스타일 | 완료 |
| 좋아요 / 조회수 | 작품별 좋아요 및 조회수 표시 | 완료 |
| 댓글 시스템 | 작품 상세 페이지 내 댓글 작성/표시 | UI 완료 (백엔드 미연동) |
| 팔로우 & 알림 | 타입 정의 완료 | UI 미구현 |
| 태그 시스템 | 작품별 태그, 호버 시 표시 | 완료 |
| 공지사항 캐러셀 | 메인 페이지 상단 공지사항 슬라이드 | 완료 |

### 6.2 커미션 기능 (크몽 역할)

| 기능 | 설명 | 구현 상태 |
|------|------|-----------|
| 커미션 상품 등록 | 패키지 단위 (포트레이트/캐릭터 디자인/환경 컨셉/만화 페이지) | 완료 |
| 커미션 마켓플레이스 | 커미션 목록 탐색, 가격/타입 필터 | 완료 |
| 의뢰 폼 | 설명, 참고 이미지, 마감 기한, 예산 입력 | 완료 |
| 작품 -> 커미션 전환 | 작품 상세 페이지에서 "커미션 의뢰" 버튼 클릭 시 작가 커미션 탭 이동 | 완료 |
| 에스크로 결제 | 타입 정의 완료 | UI 미구현 |
| 작업 상태 트래킹 | 접수/작업중/수정/완료 상태 타입 | UI 미구현 |
| 리뷰 & 평점 | 타입 정의 완료 | UI 미구현 |

### 6.3 프린팅/굿즈 기능 (Redbubble 역할)

| 기능 | 설명 | 구현 상태 |
|------|------|-----------|
| 프린팅 요청 | 작품 상세 페이지에서 "프린팅 요청" 버튼 | 완료 |
| 상품 종류 | 액자, 텀블러, 보조배터리, 티셔츠, 휴대폰 케이스, 포스터 | 완료 |
| 시뮬레이션 미리보기 | 선택 상품에 작품 적용 실시간 미리보기 (Canvas 렌더링) | 완료 |
| 사이즈 옵션 | 상품별 사이즈 선택 | 완료 |
| 장바구니 | 상품 추가/삭제/수량 변경 | 완료 |
| 디지털 판매 | 디지털 다운로드 상품 | 완료 |
| 별도 샵 | 전체 상품 목록, 필터링 | 완료 |
| 상품 상세 | 개별 상품 페이지 | 완료 |

### 6.4 결제 및 주문 관리

| 기능 | 설명 | 구현 상태 |
|------|------|-----------|
| 체크아웃 | 배송지 입력/결제 정보 입력 폼 | 완료 |
| 주문 성공 | 주문 확인 페이지 | 완료 |
| 주문 내역 | 주문 목록 및 상태 조회 | 완료 |
| 아티스트 대시보드 | 수익/통계/빠른 관리 | 완료 |

### 6.5 (확장) NFT & 로열티 구조 - v2.0 범위

| 기능 | 설명 | 구현 상태 |
|------|------|-----------|
| 완성작 NFT 민팅 | - | 미구현 (v2 예정) |
| 로열티 분배 | 원작자 + NFT 보유자 자동 수익 배분 | 미구현 (v2 예정) |
| 2차 굿즈 판매 수익 배분 | - | 미구현 (v2 예정) |

---

## 7. 페이지 구조 (사이트맵)

```
/                           메인 페이지 (공지 캐러셀 + 인기 작품 + 인기 아티스트)
/explore                    작품 탐색 (Masonry 갤러리 + 필터 + 정렬)
/artwork/[id]               작품 상세 (커뮤니티형 3컬럼 레이아웃)
/artist/[username]          아티스트 프로필 (포트폴리오/커미션/샵/소개 탭)
/commissions                커미션 마켓플레이스
/commissions/[id]/request   커미션 의뢰 폼
/shop                       굿즈/상품 마켓
/product/[id]               상품 상세
/cart                       장바구니
/checkout                   결제
/orders                     주문 내역
/orders/success             주문 완료
/dashboard                  아티스트 대시보드
```

---

## 8. 데이터 모델

### 8.1 사용자 & 아티스트

```typescript
interface User {
  id: string
  username: string
  email: string
  role: "artist" | "client" | "admin"
  displayName: string
  avatar?: string
  bio?: string
  location?: string
  website?: string
  socialLinks?: { instagram?: string; twitter?: string; artstation?: string }
  createdAt: Date
  isVerified: boolean
}

interface Artist extends User {
  role: "artist"
  portfolioDescription?: string
  specialties: string[]
  commissionStatus: "open" | "closed" | "limited"
  responseTime?: string
  totalSales: number
  rating: number
  reviewCount: number
}
```

### 8.2 작품

```typescript
interface Artwork {
  id: string
  artistId: string
  title: string
  description: string
  category: "illustration" | "character-design" | "concept-art" | "comic" | "animation" | "graphic-design" | "other"
  tags: string[]
  imageUrl: string
  thumbnailUrl?: string
  width: number
  height: number
  visibility: "public" | "private" | "followers-only"
  isMature: boolean
  likes: number
  views: number
  comments: number
  createdAt: Date
  updatedAt: Date
}
```

### 8.3 커미션

```typescript
interface CommissionPackage {
  id: string
  artistId: string
  name: string
  type: "illustration" | "character-design" | "portrait" | "logo" | "comic-page" | "animation" | "custom"
  description: string
  features: string[]
  price: number
  deliveryDays: number
  revisions: number
  examples: string[]
  isActive: boolean
  slots: number
  slotsAvailable: number
}

interface CommissionRequest {
  id: string
  packageId: string
  clientId: string
  artistId: string
  status: "open" | "in-progress" | "review" | "completed" | "cancelled"
  description: string
  referenceImages?: string[]
  budget: number
  deadline?: Date
  createdAt: Date
  updatedAt: Date
}
```

### 8.4 상품 & 주문

```typescript
interface Product {
  id: string
  artistId: string
  artworkId?: string
  name: string
  description: string
  type: "digital-download" | "print" | "merchandise"
  merchType?: "poster" | "t-shirt" | "hoodie" | "sticker" | "phone-case" | "art-print" | "canvas"
  price: number
  imageUrl: string
  variants?: { name: string; options: string[]; priceModifier: number }[]
  stock?: number
  isActive: boolean
  sales: number
  createdAt: Date
}

interface Order {
  id: string
  customerId: string
  items: { productId: string; quantity: number; price: number; variant?: string }[]
  subtotal: number
  tax: number
  shipping: number
  total: number
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled"
  shippingAddress?: Address
  createdAt: Date
  updatedAt: Date
}
```

### 8.5 소셜 & 공지

```typescript
interface Comment {
  id: string
  artworkId: string
  userId: string
  content: string
  likes: number
  replyTo?: string
  createdAt: Date
}

interface Announcement {
  id: string
  title: string
  description: string
  link?: string
  imageUrl?: string
  badge?: string
  badgeVariant?: "default" | "secondary" | "destructive" | "outline"
  createdAt: Date
  expiresAt?: Date
}
```

---

## 9. 디자인 시스템

### 9.1 디자인 방향

- **미니멀 모던** 스타일 (참조: iOS 캘린더 앱 디자인)
- 부드러운 크림/베이지 배경 (`#faf8f5`)
- 보라색 포인트 컬러 (`#7c5cfc`)
- 둥근 모서리 (`rounded-full`, `rounded-2xl`)
- 미세한 그림자 (`shadow-sm`)
- 깔끔한 카드 기반 UI

### 9.2 컬러 팔레트

| 토큰 | 용도 | 값 |
|------|------|-----|
| `--background` | 전체 배경 | `#faf8f5` (크림) |
| `--foreground` | 기본 텍스트 | `#1a1a1a` (거의 블랙) |
| `--card` | 카드 배경 | `#ffffff` |
| `--primary` | 주요 액센트 | `#7c5cfc` (보라) |
| `--muted` | 보조 배경 | `#f0ede8` |
| `--border` | 테두리 | `#e5e0d8` |

### 9.3 타이포그래피

- **본문:** Geist (sans-serif)
- **코드:** Geist Mono (monospace)
- **최대 폰트 패밀리 수:** 2개

### 9.4 레이아웃 특징

- 작품 갤러리: **Masonry (CSS columns)** 레이아웃, 다양한 이미지 비율 지원
- 작품 상세: **3컬럼 커뮤니티형** (사이드 네비 + 메인 콘텐츠 + 추천 사이드바)
- 메인 페이지: **중앙 정렬** (`max-w-6xl`), 캐러셀 + 카드 그리드

---

## 10. 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript |
| 스타일링 | Tailwind CSS v4 |
| UI 라이브러리 | shadcn/ui |
| 상태 관리 | React useState (로컬) |
| 데이터 | Mock Data (Supabase 연동 예정) |
| 배포 | Vercel |

---

## 11. 비즈니스 모델

| 수익원 | 설명 |
|--------|------|
| 커미션 수수료 | 거래 금액의 X% |
| 디지털 판매 수수료 | 다운로드 판매 수수료 |
| 굿즈 제작 수익 | 제작비 + 마진 |
| 프리미엄 작가 요금 | 노출 부스팅, 상세 페이지 확장 |
| (확장) NFT 거래 수수료 | 2차 거래 시 수수료 |

---

## 12. 성공 지표 (KPI)

| 지표 | 설명 |
|------|------|
| MAU-Artist | 월간 활성 작가 수 |
| 월간 커미션 거래 수 | 커미션 신규 의뢰 건수 |
| 굿즈 주문 전환율 | 작품 조회 대비 프린팅 주문 비율 |
| 커미션 -> 굿즈 전환율 | 커미션 완료 후 굿즈 주문 비율 |
| 재구매율 | 재주문 고객 비율 |
| 작가 평균 월 수익 | 작가 1인당 월 평균 수익 |

---

## 13. 향후 로드맵

### Phase 1 - MVP (현재)
- [x] 프론트엔드 프로토타입 전체 완료
- [ ] Supabase 데이터베이스 연동
- [ ] 인증 시스템 (회원가입/로그인/작가 전환)
- [ ] 실제 이미지 업로드 (Vercel Blob)
- [ ] 기본 결제 연동 (Stripe / Toss Payments)

### Phase 2 - 커뮤니티 강화
- [ ] 실시간 알림 시스템
- [ ] 팔로우/팔로워 기능
- [ ] 댓글 대댓글 및 좋아요
- [ ] 작가 간 메시지 기능
- [ ] 커미션 작업 상태 실시간 트래킹
- [ ] 에스크로 결제 시스템

### Phase 3 - 수익 확장
- [ ] 프린팅 파트너사 API 연동 (실물 굿즈 제작/배송)
- [ ] NFT 민팅 및 로열티 분배
- [ ] 프리미엄 작가 플랜
- [ ] 광고 시스템
- [ ] 국제화 (다국어 지원)

### Phase 4 - 성장
- [ ] 모바일 앱 (React Native)
- [ ] AI 기반 작가/작품 추천
- [ ] 커뮤니티 이벤트/공모전 시스템
- [ ] 아티스트 수익 분석 대시보드 고도화
- [ ] API 공개 (파트너 연동)

---

## 14. 현재 프로젝트 파일 구조

```
app/
  page.tsx                        # 메인 페이지
  layout.tsx                      # 루트 레이아웃
  globals.css                     # 글로벌 스타일 (디자인 토큰)
  explore/page.tsx                # 작품 탐색 (Masonry)
  artwork/[id]/page.tsx           # 작품 상세 (서버 컴포넌트)
  artist/[username]/page.tsx      # 아티스트 프로필
  commissions/page.tsx            # 커미션 마켓
  commissions/[id]/request/page.tsx  # 커미션 의뢰 폼 (서버 컴포넌트)
  shop/page.tsx                   # 상품 마켓
  product/[id]/page.tsx           # 상품 상세 (서버 컴포넌트)
  cart/page.tsx                   # 장바구니
  checkout/page.tsx               # 결제
  orders/page.tsx                 # 주문 내역
  orders/success/page.tsx         # 주문 완료
  dashboard/page.tsx              # 아티스트 대시보드

components/
  site-header.tsx                 # 공통 헤더 네비게이션
  site-footer.tsx                 # 공통 푸터
  artwork-page-client.tsx         # 작품 상세 클라이언트 컴포넌트 (프린팅 시뮬레이션 포함)
  commission-request-form.tsx     # 커미션 의뢰 폼 클라이언트 컴포넌트
  product-page-client.tsx         # 상품 상세 클라이언트 컴포넌트

lib/
  types.ts                        # 전체 TypeScript 타입 정의
  mock-data.ts                    # Mock 데이터 (아티스트/작품/커미션/상품/공지)
  utils.ts                        # 유틸리티 함수 (cn 등)
```

---

## 15. 참고 레퍼런스

| 플랫폼 | 참고 포인트 |
|--------|-------------|
| DeviantArt | 커뮤니티형 작품 상세 레이아웃 (3컬럼), 댓글/좋아요 UX |
| Pinterest | Masonry 갤러리 레이아웃 |
| Reddit | Hot / Top / New 정렬 시스템 |
| 크몽 (Kmong) | 커미션 패키지 구조, 의뢰 플로우 |
| Redbubble | 프린팅 상품 선택, 시뮬레이션 미리보기 |
| iOS Calendar App | 미니멀 모던 디자인, 부드러운 배경/둥근 카드 |
