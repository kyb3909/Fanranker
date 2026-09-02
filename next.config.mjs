import { withSentryConfig } from "@sentry/nextjs"
import bundleAnalyzer from "@next/bundle-analyzer"

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

// 현재 enforcing CSP와 동일한 외부 호스트 whitelist. `'unsafe-eval'`만 제거.
// Report-Only로 위반을 수집하며 점진적으로 enforce 전환 준비.
// 전환 체크리스트: `app/api/security/csp-report`로 들어온 위반을 1~2주 관측 →
// nonce/hash 필요한 인라인 스크립트를 식별 → `Content-Security-Policy`도 동일 정책으로 교체.
//
// ⚠️ style-src 는 `'unsafe-inline'` 을 유지한다 (2026-08-02).
//    벤치마크 실측: 모든 페이지뷰마다 style-src 위반 리포트가 정확히 5건씩 발생했고,
//    원인은 전부 React `style={{...}}` 인라인 스타일이었다. 이 코드베이스는 인라인 스타일을
//    광범위하게 쓰므로 **구조적으로 clean 해질 수 없다** — 관측을 계속해도 enforce 전환이라는
//    목표에 도달하지 못한다. 그런데 비용은 계속 나갔다: csp-report 핸들러가 위반마다
//    Sentry.captureMessage 를 올려 **페이지뷰 1회당 Sentry 이벤트 5건**을 태우고 있었다
//    (쿼터 소모 + 진짜 에러 매몰).
//    XSS 위험은 script-src 에 있지 style-src 에 있지 않으므로, script-src 만 strict 로 남긴다.
//    인라인 스타일을 전부 클래스로 걷어낸 뒤에 다시 조이는 것이 순서다.
// ── CSP 화이트리스트 단일 소스 (2026-08-08 감사 P2-5) ──
// 종전엔 enforce/report-only 두 문자열에 같은 호스트 목록이 중복 하드코딩돼 있어
// 외부 호스트 추가 시 한쪽만 고치는 drift 사고 지점이었다. 이제 호스트는 아래
// 상수 한 곳만 고치면 두 정책에 함께 반영된다. 두 정책의 의도적 차이는 script-src
// 의 'unsafe-inline'/'unsafe-eval' 유무(TipTap/광고 호환)와 report-uri 뿐이다.
const CSP_SCRIPT_HOSTS =
  "https://platform.twitter.com https://platform.x.com https://www.instagram.com https://*.cdninstagram.com https://embed.bsky.app https://clerk.gongnori.fan https://*.clerk.accounts.dev https://challenges.cloudflare.com https://*.sentry.io https://va.vercel-scripts.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://adservice.google.com https://www.google.com https://tpc.googlesyndication.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google"

const CSP_SHARED_DIRECTIVES = [
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://clerk.gongnori.fan",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "frame-src 'self' https://www.youtube.com https://streamable.com https://platform.twitter.com https://platform.x.com https://www.instagram.com https://embed.bsky.app https://clerk.gongnori.fan https://*.clerk.accounts.dev https://challenges.cloudflare.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google",
  // blob: — GLTFLoader 가 GLB 내장 텍스처를 blob URL 로 꺼내 fetch 한다
  //         (경기장 입장 아바타). 페이지가 스스로 만든 same-origin 객체다.
  "connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co https://clerk.gongnori.fan https://*.clerk.dev https://*.clerk.com https://api.clerk.com https://*.clerk.accounts.dev https://clerk-telemetry.com https://challenges.cloudflare.com https://*.sentry.io https://*.ingest.sentry.io https://va.vercel-scripts.com https://cdn.jsdelivr.net https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.googleadservices.com https://*.google.com https://*.doubleclick.net https://adservice.google.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://www.instagram.com https://*.cdninstagram.com https://*.fbcdn.net",
]

const ENFORCED_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${CSP_SCRIPT_HOSTS}`,
  ...CSP_SHARED_DIRECTIVES,
].join('; ')

const STRICT_CSP_REPORT_ONLY = [
  "default-src 'self'",
  `script-src 'self' ${CSP_SCRIPT_HOSTS}`,
  ...CSP_SHARED_DIRECTIVES,
  "report-uri /api/security/csp-report",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The isolated avatar preview can run beside the main app dev server without
  // both processes writing to the same route/build manifests.
  distDir: process.env.AVATAR_LAB_DEV === "1" ? ".next-avatar-lab" : ".next",
  // OG 카드(app/opengraph-image.tsx)가 fs 로 읽는 임베드 폰트 — 파일 트레이싱이 놓치면
  // 프로덕션에서만 ENOENT 로 죽는다 (satori 는 woff2 를 못 읽어 ttf 를 따로 둠, 2026-08-20)
  outputFileTracingIncludes: {
    // 메타데이터 라우트는 빌드에 따라 키가 "/opengraph-image" 또는 "/opengraph-image/route" 로
    // 잡힌다 — 둘 다 건다 (한쪽은 no-op, 비용 없음)
    "/opengraph-image": ["./app/_og/*.ttf"],
    "/opengraph-image/route": ["./app/_og/*.ttf"],
    /**
     * ⚠️ 카드 라우트가 늘면 **여기도 같이 늘려야 한다** (2026-08-25). 안 걸면 로컬에선
     *    되는데 Vercel 에서만 폰트를 못 찾아 satori 기본 웨이트로 떨어진다 — 워드마크가
     *    라이트로 렌더되는 그 증상이다. 글로브로 한 번에 건다.
     */
    "/post/[id]/opengraph-image": ["./app/_og/*.ttf"],
    "/post/[id]/opengraph-image/route": ["./app/_og/*.ttf"],
    "/match/[gameId]/opengraph-image": ["./app/_og/*.ttf"],
    "/match/[gameId]/opengraph-image/route": ["./app/_og/*.ttf"],
    "/saga/[slug]/opengraph-image": ["./app/_og/*.ttf"],
    "/saga/[slug]/opengraph-image/route": ["./app/_og/*.ttf"],
  },
  // Next.js 15 스트리밍 메타데이터: 일반 UA는 메타데이터(description/og/canonical 등)를 <body>로
  // 스트림하고 브라우저가 <head>로 hoist. 아래 매칭 봇은 blocking 렌더 → 메타데이터를 <head>에
  // 직접 출력(JS 미실행 스크래퍼·링크 미리보기 대응).
  // 값 = Next 기본 htmlLimitedBots 목록 + 한국 봇(Naver Yeti / KakaoTalk / Daum) + Chrome-Lighthouse.
  //   기본 목록엔 한국 봇이 없어 카카오톡 미리보기·네이버 검색이 메타데이터를 못 받았음.
  //   Chrome-Lighthouse: Lighthouse/PSI는 head만 감사해 SEO(meta description) 0점 오탐 → blocking 렌더로 대응.
  //   Next 업그레이드 시 기본 목록 변동분 재확인 필요.
  htmlLimitedBots:
    /Googlebot|Mediapartners-Google|AdsBot-Google|googleweblight|Storebot-Google|Google-PageRenderer|Google-InspectionTool|Bingbot|BingPreview|Slurp|DuckDuckBot|baiduspider|yandex|sogou|LinkedInBot|bitlybot|tumblr|vkShare|quora link preview|facebookexternalhit|facebookcatalog|Twitterbot|applebot|redditbot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|ia_archiver|Yeti|kakaotalk-scrap|Daumoa|Chrome-Lighthouse/i,
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
            value: ENFORCED_CSP,
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
        // Babylon/Webpack의 개발 빌드는 생성된 셰이더 코드를 eval로 평가한다.
        // 이를 모두 CSP 위반으로 전송하면 로컬 보고 API가 폭주해 초기화가 수분간 멈춘다.
        // 실제 적용 정책은 유지하고, 격리된 랩에서만 관측용 정책을 동일하게 맞춘다.
        source: '/avatar-lab',
        headers: [
          {
            key: 'Content-Security-Policy-Report-Only',
            value: ENFORCED_CSP,
          },
        ],
      },
      {
        // 랩 하위 경로(경기장 워크 데모 등)도 같은 Babylon eval 특성을 가진다.
        source: '/avatar-lab/:path*',
        headers: [
          {
            key: 'Content-Security-Policy-Report-Only',
            value: ENFORCED_CSP,
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
  // 1차 월드컵 이벤트 아카이브 비공개 (2026-07-30) — layout 의 redirect() 는
  // 스트리밍 렌더라 응답이 200 + 본문에 옛 콘텐츠가 실린 채 meta refresh 로만
  // 이동한다(실측). 크롤러/심사봇에게 콘텐츠가 새므로 HTTP 레벨 307 로 격상.
  // layout 쪽 redirect 는 이중 안전망으로 유지.
  async redirects() {
    return [
      {
        source: '/worldcup/:path*',
        destination: '/prediction',
        permanent: false,
      },
      {
        source: '/worldcup',
        destination: '/prediction',
        permanent: false,
      },
      // 시즌 개막·코그 이벤트 페이지 폐쇄 (2026-09-02 운영자: "승부예측 이벤트 페이지도 모두
      // 닫아놓고"). 월드컵과 같은 이유로 307 — 루트 app/loading.tsx 때문에 layout 의
      // redirect() 는 여전히 200 + meta refresh 다(2026-09-02 재실측). layout 쪽은 안전망.
      // /event/gunners-season 은 page 가 /season 으로 넘기던 옛 허브 — 두 홉 대신 바로.
      // ⚠️ /season/:path* 로 쓰면 안 된다 — redirect 는 public/ 보다 먼저 평가되는데
      // public/season/crest-*.png 가 팀 게시판 엠블럼(lib/constants/team-boards.ts)으로
      // 사이트 전역에서 쓰인다. 하위 라우트 세 개만 명시한다.
      // 재개 시 이 네 항목을 지우고 두 layout 의 redirect 도 함께 제거 (gunners-season.ts 주석).
      {
        source: '/season/:sub(join|big4|results)',
        destination: '/prediction',
        permanent: false,
      },
      {
        source: '/season',
        destination: '/prediction',
        permanent: false,
      },
      {
        source: '/cog-event',
        destination: '/prediction',
        permanent: false,
      },
      {
        source: '/event/gunners-season',
        destination: '/prediction',
        permanent: false,
      },
    ]
  },
  // Supabase Storage URL을 자체 도메인으로 프록시 (도메인 노출 방지)
  async rewrites() {
    return [
      {
        source: '/storage/:path*',
        destination: `https://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/:path*`,
      },
      {
        // 크롤링 출처 은닉: 클라이언트는 /api/sports/ 만 노출
        // (/api/live-scores → /api/wisetoto 별칭은 2026-09-02 에 걷어냈다 — wisetoto 가 문을
        //  닫아 7일간 0건이었고, 라이브·FT 점수는 LFA 상세 캐시가 공급한다)
        source: '/api/sports/:path*',
        destination: '/api/betman/:path*',
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
