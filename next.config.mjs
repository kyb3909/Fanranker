import { withSentryConfig } from "@sentry/nextjs"
import bundleAnalyzer from "@next/bundle-analyzer"

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

// 현재 enforcing CSP와 동일한 외부 호스트 whitelist. `'unsafe-inline'` / `'unsafe-eval'`만 제거.
// Report-Only로 위반을 수집하며 점진적으로 enforce 전환 준비.
// 전환 체크리스트: `app/api/security/csp-report`로 들어온 위반을 1~2주 관측 →
// nonce/hash 필요한 인라인 스크립트를 식별 → `Content-Security-Policy`도 동일 정책으로 교체.
const STRICT_CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' https://platform.twitter.com https://platform.x.com https://www.instagram.com https://*.cdninstagram.com https://clerk.gongnori.fan https://*.clerk.accounts.dev https://challenges.cloudflare.com https://*.sentry.io https://va.vercel-scripts.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://adservice.google.com https://www.google.com https://tpc.googlesyndication.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google",
  "worker-src 'self' blob:",
  "style-src 'self' https://cdn.jsdelivr.net https://clerk.gongnori.fan",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "frame-src 'self' https://www.youtube.com https://streamable.com https://platform.twitter.com https://platform.x.com https://www.instagram.com https://clerk.gongnori.fan https://*.clerk.accounts.dev https://challenges.cloudflare.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://clerk.gongnori.fan https://*.clerk.dev https://*.clerk.com https://api.clerk.com https://*.clerk.accounts.dev https://clerk-telemetry.com https://challenges.cloudflare.com https://*.sentry.io https://*.ingest.sentry.io https://va.vercel-scripts.com https://cdn.jsdelivr.net https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.googleadservices.com https://*.google.com https://*.doubleclick.net https://adservice.google.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://www.instagram.com https://*.cdninstagram.com https://*.fbcdn.net",
  "report-uri /api/security/csp-report",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 15 스트리밍 메타데이터: 일반 UA는 메타데이터(description/og/canonical 등)를 <body>로
  // 스트림하고 브라우저가 <head>로 hoist. 아래 매칭 봇은 blocking 렌더 → 메타데이터를 <head>에
  // 직접 출력(JS 미실행 스크래퍼·링크 미리보기 대응).
  // 값 = Next 기본 htmlLimitedBots 목록 + 한국 봇(Naver Yeti / KakaoTalk / Daum).
  //   기본 목록엔 한국 봇이 없어 카카오톡 미리보기·네이버 검색이 메타데이터를 못 받았음.
  //   Next 업그레이드 시 기본 목록 변동분 재확인 필요.
  htmlLimitedBots:
    /Googlebot|Mediapartners-Google|AdsBot-Google|googleweblight|Storebot-Google|Google-PageRenderer|Google-InspectionTool|Bingbot|BingPreview|Slurp|DuckDuckBot|baiduspider|yandex|sogou|LinkedInBot|bitlybot|tumblr|vkShare|quora link preview|facebookexternalhit|facebookcatalog|Twitterbot|applebot|redditbot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|ia_archiver|Yeti|kakaotalk-scrap|Daumoa/i,
  // Lighthouse Best Practices: 소스맵은 개발환경에서만 사용
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://platform.twitter.com https://platform.x.com https://www.instagram.com https://*.cdninstagram.com https://clerk.gongnori.fan https://*.clerk.accounts.dev https://challenges.cloudflare.com https://*.sentry.io https://va.vercel-scripts.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://adservice.google.com https://www.google.com https://tpc.googlesyndication.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://clerk.gongnori.fan",
              "img-src 'self' data: blob: https:",
              "media-src 'self' data: blob: https:",
              "font-src 'self' data: https://cdn.jsdelivr.net",
              "frame-src 'self' https://www.youtube.com https://streamable.com https://platform.twitter.com https://platform.x.com https://www.instagram.com https://clerk.gongnori.fan https://*.clerk.accounts.dev https://challenges.cloudflare.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://clerk.gongnori.fan https://*.clerk.dev https://*.clerk.com https://api.clerk.com https://*.clerk.accounts.dev https://clerk-telemetry.com https://challenges.cloudflare.com https://*.sentry.io https://*.ingest.sentry.io https://va.vercel-scripts.com https://cdn.jsdelivr.net https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.googleadservices.com https://*.google.com https://*.doubleclick.net https://adservice.google.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://www.instagram.com https://*.cdninstagram.com https://*.fbcdn.net",
            ].join('; '),
          },
          // 관측용 strict 정책 — 차단하지 않고 위반만 report-uri로 수집.
          // 운영에서 1~2주 clean하면 위 Content-Security-Policy도 동일 내용으로 교체.
          {
            key: 'Content-Security-Policy-Report-Only',
            value: STRICT_CSP_REPORT_ONLY,
          },
        ],
      },
      {
        // 미니게임(public/games/*.html) 을 /games/* 래퍼 페이지 iframe 으로 띄우기 위한 예외.
        // 전역 DENY 를 SAMEORIGIN 으로 완화 (같은 도메인 framing 만 허용 — 클릭재킹 방어 유지).
        // 글로벌 '/(.*)' 항목보다 뒤에 있어야 같은 키를 override 함.
        source: '/games/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      {
        // 서비스워커는 항상 최신으로 — 캐시 금지. 자기소멸(청소) 워커가 다음 접속 즉시
        // 전파되어, 구버전 화면을 붙들고 있는 옛 SW/캐시를 모든 PC에서 빠르게 정리하게 함.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        // Cache read-only API responses (posts, profiles, communities)
        source: '/api/(posts|communities|profiles)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=120' },
        ],
      },
      {
        // Cache feed/prediction APIs (short TTL, stale-while-revalidate)
        source: '/api/feed/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=15, stale-while-revalidate=60' },
        ],
      },
      {
        // Cache standings/ranking APIs
        source: '/api/(standings|ranking|betman/games)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' },
        ],
      },
      {
        // No cache for mutation/auth APIs
        source: '/api/(upload|payments|tokens|admin|cron|auth)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        /**
         * 유저별 개인 응답 — 반드시 마지막에 둔다 (동일 키는 뒤 규칙이 이긴다).
         *
         * 위 read-only 규칙들은 메서드·인증 조건이 없어서, 자체 Cache-Control 을
         * 세우지 않는 개인화 GET 라우트가 그대로 `public, s-maxage` 를 물려받았다.
         * 로그인 유저의 응답이 CDN 에 캐시되면 다른 사용자에게 그대로 나갈 수 있다.
         *   /api/feed/predictions  구매 여부(is_purchased)
         *   /api/feed/snack        개인화 피드
         *   /api/posts/my          내 글
         *   /api/posts/[id]/bookmark, /vote   내 북마크·내 투표 상태
         *
         * ⚠️ 위 '/api/(posts|communities|profiles)' 패턴의 communities/profiles 는
         *    실재하지 않는 경로다(헛도는 중). 이를 "오타 수정" 하면 캐시 범위가
         *    넓어지므로 손대지 말 것.
         */
        source: '/api/(feed/predictions|feed/snack|posts/my)',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        source: '/api/posts/:id/(bookmark|vote)',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        // CSP 위반 보고: 캐시 금지
        source: '/api/security/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ]
  },
  images: {
    // 이미지 최적화 활성화 (unoptimized: true 제거)
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.ytimg.com', // YouTube 썸네일 (i.ytimg.com + i1~i9 CDN 미러)
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com', // YouTube 썸네일 (hqdefault)
      },
      {
        protocol: 'https',
        hostname: '*.ggpht.com', // YouTube 커뮤니티 게시물 이미지 (yt3.ggpht.com 등)
      },
      {
        protocol: 'https',
        hostname: '*.cdninstagram.com', // Instagram
      },
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com', // Twitter/X
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co', // Supabase Storage
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com', // Clerk avatars
      },
    ],
    // 모던 이미지 포맷 사용
    formats: ['image/avif', 'image/webp'],
    // 디바이스 사이즈 최적화
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Supabase Storage URL을 자체 도메인으로 프록시 (도메인 노출 방지)
  async rewrites() {
    return [
      {
        source: '/storage/:path*',
        destination: `https://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/:path*`,
      },
      {
        // 크롤링 출처 은닉: 클라이언트는 /api/sports/, /api/live-scores/ 만 노출
        source: '/api/sports/:path*',
        destination: '/api/betman/:path*',
      },
      {
        source: '/api/live-scores/:path*',
        destination: '/api/wisetoto/:path*',
      },
    ]
  },
  // Webpack splitChunks 튜닝: @sentry/* 가 두 chunk 에 중복 부킹 (60KB × 2)되는 문제 해결.
  // 모든 Sentry 모듈을 단일 'sentry' chunk 로 강제해 페이지 로드 시 한 번만 다운로드.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.optimization = config.optimization || {}
      config.optimization.splitChunks = config.optimization.splitChunks || {}
      config.optimization.splitChunks.cacheGroups = {
        ...(config.optimization.splitChunks.cacheGroups || {}),
        sentry: {
          test: /[\\/]node_modules[\\/]@sentry[\\/]/,
          name: "sentry",
          chunks: "all",
          priority: 30,
          enforce: true,
          reuseExistingChunk: true,
        },
      }
    }
    return config
  },
  // 실험적 기능: 패키지 최적화
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@clerk/nextjs',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-tooltip',
      'date-fns',
      'swr',
      'recharts',
      '@tiptap/core',
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/pm',
      '@tiptap/extension-image',
      '@tiptap/extension-placeholder',
      '@tiptap/extension-text-align',
      '@next/third-parties',
    ],
  },
}

// Sentry: 서버/edge 는 instrumentation.ts, 클라이언트는 instrumentation-client.ts
// (에러 전용 경량 구성 — replay/tracing 없음. 과거 165KB 제거의 원흉은 replay 였고,
// 이번 복원은 온보딩 사각지대(브라우저 에러 미수집)를 닫기 위한 것).
// 클라이언트 webpack plugin 도 다시 켠다 — client 소스맵 업로드가 있어야
// 브라우저 에러 스택이 minified 가 아닌 원본 코드로 보인다.
// SENTRY_AUTH_TOKEN 없으면 source map 업로드 단계 자동 skip.
export default withBundleAnalyzer(
  withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: !process.env.CI,
    hideSourceMaps: true,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    // 클라이언트는 에러 캡처 전용 — 안 쓰는 tracing/replay/디버그 코드를
    // 번들에서 트리쉐이킹. (측정: 미적용 시 공용 First Load +113KB)
    bundleSizeOptimizations: {
      excludeDebugStatements: true,
      excludeTracing: true,
      excludeReplayShadowDom: true,
      excludeReplayIframe: true,
      excludeReplayWorker: true,
    },
  })
)
