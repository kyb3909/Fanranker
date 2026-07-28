// 클라이언트(브라우저) Sentry — **에러 캡처 전용 경량 구성**.
//
// 히스토리: 과거 클라이언트 Sentry 는 replay(세션 녹화) + tracing 포함 구성이라
// 모바일 First Load JS 를 165KB 부풀려 제거됐다(d358f3cc). 그 뒤로 브라우저
// 에러는 아무것도 안 잡혀서 온보딩 이탈이 최대 사각지대였다.
// 이번 복원은 에러 캡처만 켠다 — replay 없음, tracing 없음.
// (다시 replay/tracing 을 켜고 싶다면 번들 영향부터 측정할 것.)
//
// 이 파일은 Next.js 15.3+ 네이티브 규약 — 번들러(webpack/Turbopack) 무관하게
// 클라이언트 진입 시 로드된다. 구 sentry.client.config.ts 는 삭제됨.
import * as Sentry from "@sentry/nextjs"

function sanitizeEvent<T extends Sentry.ErrorEvent>(event: T): T | null {
  // extra 에 secret 계열 키 마스킹 (instrumentation.ts 서버 구성과 동일 규칙)
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      if (/password|secret|token|apiKey|service_role/i.test(key)) {
        event.extra[key] = "[redacted]"
      }
    }
  }
  return event
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // 에러 전용 — 성능 트레이싱 완전 비활성 (번들·전송량 절약)
  tracesSampleRate: 0,
  debug: false,

  // 우리가 고칠 수 없는 소스에서 온 에러는 버린다 (쿼터·노이즈 방어)
  denyUrls: [
    // 브라우저 확장
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-web-extension:\/\//i,
    // 광고 스크립트
    /googlesyndication\.com/i,
    /doubleclick\.net/i,
    /adtrafficquality\.google/i,
    // 서드파티 임베드
    /platform\.twitter\.com/i,
    /platform\.x\.com/i,
    /instagram\.com/i,
    /cdninstagram\.com/i,
  ],

  ignoreErrors: [
    // 서버 구성과 동일 (예상된 인증 만료/RLS 거부)
    "JWT expired",
    "PGRST301",
    "AbortError",
    "The user aborted a request",
    // 브라우저 공통 노이즈
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Script error.", // cross-origin opaque error — 스택 없음, 조치 불가
    // 모바일 플레이키 네트워크/광고차단기. 실제 API 장애는 서버 Sentry 가 잡는다.
    "Failed to fetch",
    "NetworkError when attempting to fetch resource",
    "Load failed",
    "adsbygoogle",
  ],

  beforeSend: sanitizeEvent,
})
