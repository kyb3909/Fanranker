/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Lighthouse Best Practices: 대용량 JS 소스맵 (디버깅·분석용)
  productionBrowserSourceMaps: true,
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://platform.twitter.com https://www.instagram.com https://*.clerk.accounts.dev",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "frame-src https://www.youtube.com https://platform.twitter.com https://www.instagram.com https://*.clerk.accounts.dev",
              "connect-src 'self' https://*.supabase.co https://*.clerk.dev https://*.clerk.com https://api.clerk.com https://*.clerk.accounts.dev https://clerk-telemetry.com",
            ].join('; '),
          },
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
  // 실험적 기능: 패키지 최적화
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-avatar',
      'recharts',
    ],
  },
}

export default nextConfig
