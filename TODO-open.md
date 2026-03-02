# 오픈 준비 체크리스트

## CRITICAL (반드시 수정)

| # | 항목 | 상태 |
|---|---|---|
| 1 | Clerk Production 전환 | ✅ 완료 |
| 2 | 이용약관 / 개인정보처리방침 / 운영정책 실제 내용 작성 | ⬜ 미완 |
| 3 | OG title 버그 수정 (description → title) | ✅ 완료 |

## HIGH (오픈 전 권장)

| # | 항목 | 상태 |
|---|---|---|
| 4 | HSTS 헤더 추가 | ✅ 완료 |
| 5 | Sentry 환경변수 `.env.example`에 문서화 | ✅ 완료 |
| 6 | `commission-auto-release` cron 인증을 `verifyCronSecret()`으로 통일 | ✅ 완료 |
| 7 | `daily-token-reset` sequential loop → 배치 처리 (스케일링) | ✅ 완료 |
| 8 | GmarketSans 폰트 최적화 (366KB → unicode-range 4글자만) | ✅ 완료 |
| 9 | Color contrast 접근성 수정 | ✅ 완료 |

## MEDIUM (오픈 후 개선 가능)

| # | 항목 | 상태 |
|---|---|---|
| 10 | Rate limiter 인메모리 → 분산 환경 대응 | ⬜ 미완 |
| 11 | embed HTML sanitize regex → DOMPurify | ⬜ 미완 |
| 12 | `/api/predictions/purchase` STRICT rate limit 추가 | ✅ 이미 적용됨 |
| 13 | Migration 번호 중복 정리 (029, 030) | ⬜ 미완 |
| 14 | 환경변수 런타임 검증 (`lib/env.ts` + zod) | ⬜ 미완 |
| 15 | DB 백업 전략 수립 | ⬜ 미완 |

## LOW (나중에)

| # | 항목 | 상태 |
|---|---|---|
| 16 | 댓글 수정/삭제 버튼 aria-label 추가 | ✅ 완료 |
| 17 | `images.remotePatterns` 와일드카드 제한 | ⬜ 미완 |
| 18 | Google Analytics / Search Console 연동 | ⬜ 미완 |
| 19 | 초기 시드 콘텐츠 (빈 게시판 방지) | ⬜ 미완 |

## Lighthouse 개선 목표

| 카테고리 | 현재 | 목표 |
|---|---|---|
| Performance | 88 | 93+ (폰트 최적화 후) |
| Accessibility | 97 | 100 (contrast 수정 후) |
| Best Practices | 77 | 92+ (Clerk Production 후) |
| SEO | 100 | 100 ✅ |

## FINAL (오픈 후 가입 고도화 — 외부 인증 발급 필요)

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| 20 | 카카오 소셜 로그인 추가 | ⬜ 미완 | 카카오 개발자 앱 등록 필요 |
| 21 | 네이버 소셜 로그인 추가 | ⬜ 미완 | 네이버 개발자 앱 등록 필요 |
| 22 | 휴대폰 인증 추가 | ⬜ 미완 | Clerk Dashboard에서 활성화 |
| 23 | 가입 약관 동의 체크박스 | ⬜ 미완 | Clerk Dashboard Legal 설정 |
| 24 | 커스텀 온보딩 페이지 (`/onboarding`) | ⬜ 미완 | 닉네임, 프로필 사진, MBTI, 관심사 선택 (틴더 스타일) |
| 25 | 온보딩 미완료 유저 리다이렉트 처리 | ⬜ 미완 | middleware에서 프로필 미완성 시 /onboarding으로 이동 |

## 담당 구분

### Claude가 코드로 처리
- 5, 6, 7, 8, 9, 12, 16

### 사용자가 직접 처리
- 2 (법률 문서 내용 작성)
- 15 (Supabase 백업 플랜)
- 18 (Google 계정 연동)
- 19 (콘텐츠 준비)
