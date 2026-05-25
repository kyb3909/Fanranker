// 클라이언트 Sentry init 제거 — 모바일 번들 165KB 감소가 목표.
// 서버/edge 런타임 Sentry 는 instrumentation.ts 의 register() 에서 계속 init 함
// (API/RSC 에러 캡처 유지). 클라이언트 런타임 에러는 Vercel 로그 + 사용자 신고로 인지.
//
// Next.js Sentry SDK 는 이 파일이 있어야 빌드 hook 가 안전하게 동작하므로 파일 자체는
// 유지하고 내용만 비움 (Sentry.init 호출 없음 = client 번들에 SDK 코드 트리쉐이킹 대상).
//
// 향후 클라이언트 추적이 다시 필요하면 git 히스토리에서 init 코드 복원.
export {}
