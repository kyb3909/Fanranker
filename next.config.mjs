import { withSentryConfig } from "@sentry/nextjs"

/** @type {import('next').NextConfig} */
const nextConfig = {
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
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://platform.twitter.com https://platform.x.com https://www.instagram.com https://*.clerk.accounts.dev https://challenges.cloudflare.com https://*.sentry.io https://va.vercel-scripts.com",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://cdn.jsdelivr.net",
              "frame-src https://www.youtube.com https://platform.twitter.com https://platform.x.com https://www.instagram.com https://*.clerk.accounts.dev https://challenges.cloudflare.com",
              "connect-src 'self' https://*.supabase.co https://*.clerk.dev https://*.clerk.com https://api.clerk.com https://*.clerk.accounts.dev https://clerk-telemetry.com https://*.sentry.io https://*.ingest.sentry.io https://va.vercel-scripts.com https://cdn.jsdelivr.net",
            ].join('; '),
          },
        ],
      },
      {
        // Cache read-only API responses (posts, profiles, communities)
        source: '/api/(posts|communities|profiles|games|art)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=120' },
        ],
      },
      {
        // No cache for mutation/auth APIs
        source: '/api/(upload|payments|tokens|commissions|admin|cron|auth)/:path*',
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
        hostname: 'i.ytimg.com', // YouTube 썸네일
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com', // YouTube 썸네일 (hqdefault)
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
      {
        protocol: 'https',
        hostname: '**', // OG 이미지 (외부 소스)
      },
    ],
    // 모던 이미지 포맷 사용
    formats: ['image/avif', 'image/webp'],
    // 디바이스 사이즈 최적화
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // 실험적 기능: 패키지 최적화
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      'date-fns',
      '@tiptap/core',
      '@tiptap/react',
      '@tiptap/starter-kit',
    ],
  },
}

export default withSentryConfig(nextConfig, {
  // Sentry 빌드 옵션
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // 소스맵을 Sentry에 업로드 (프로덕션 빌드에서만)
  silent: !process.env.CI,

  // 클라이언트 번들에서 소스맵 숨김
  hideSourceMaps: true,

  // 자동 트리 쉐이킹
  disableLogger: true,

  // SENTRY_AUTH_TOKEN 없으면 빌드 실패하지 않게
  authToken: process.env.SENTRY_AUTH_TOKEN,
})
