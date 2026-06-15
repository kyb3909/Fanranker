import type React from "react"
import { Suspense } from "react"
import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { Nanum_Pen_Script } from "next/font/google"
import Script from "next/script"
import { Analytics } from "@vercel/analytics/next"
import { GoogleAnalytics } from "@next/third-parties/google"
import { ClerkProvider } from "@clerk/nextjs"
import { ClerkErrorBoundary } from "@/components/clerk-error-boundary"
import { ProfileSync } from "@/components/profile/profile-sync"
import { MobileTabBar } from "@/components/mobile-tab-bar"
import { FloatingWriteButton } from "@/components/floating-write-button"
import { SITE_CONFIG, jsonLd } from "@/lib/seo"
import { AppShell } from "@/components/app-shell"
import { Toaster } from "@/components/ui/toaster"
import { GlobalReportDialog } from "@/components/global-report-dialog"
import { PWARegister } from "@/components/pwa-register"
import "./globals.css"
// 월드컵에서 추출된 에디토리얼 디자인 토큰. 모든 셀렉터가 .worldcup-scope prefix 라
// 다른 페이지엔 영향 없음 — .worldcup-scope wrapper 가 있는 트리에서만 활성화.
import "./worldcup/wc-tokens.css"

// 본문/UI 한글 폰트: Pretendard Std Variable (KS X 1001 subset, ~286 KB).
// 한국어 웹 텍스트 ~98% 커버, 누락 글리프는 시스템 폰트 폴백.
// 풀 글리프 버전은 2 MB로 FCP 차단 — std로 교체 (orioncactus/pretendard pretendard-std 패키지).
const pretendard = localFont({
  src: "../public/fonts/PretendardVariable.woff2",
  display: "swap",
  variable: "--font-pretendard",
  weight: "45 920",
})

// 제목/디스플레이 한글 폰트: SUIT (정적 wght=700 인스턴스).
// 본문 Pretendard와 듀얼 시스템 (NYT/Verge/Pitchfork 식 에디토리얼 톤).
// font-title 클래스가 항상 font-bold(700) 만 사용하므로 Variable axis 불필요.
// pyftsubset로 KS X 1001 한글(2,668자) + Latin + CJK 기호로 서브셋팅: 624KB → 173KB.
// display: optional — 첫 렌더 블로킹 안 함, 캐시되면 적용 (헤딩 폰트 특성상 fallback 허용).
// preload: false — 초기 critical path에서 제거. 헤딩 전용이라 LCP 영향 없음.
const suit = localFont({
  src: "../public/fonts/SUIT-700.woff2",
  display: "optional",
  variable: "--font-suit",
  weight: "700",
  preload: false,
})

const nanumPen = Nanum_Pen_Script({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pen",
  display: "swap",
  preload: false,
})

const koLocalization = {
  signIn: {
    start: {
      title: "로그인",
      subtitle: "계속하려면 로그인이 필요해요",
      actionText: "계정이 없으신가요?",
      actionLink: "가입하기",
    },
  },
  signUp: {
    start: {
      title: "회원가입",
      subtitle: "계속하려면 가입이 필요해요",
      actionText: "이미 계정이 있으신가요?",
      actionLink: "로그인",
    },
  },
  formFieldLabel__emailAddress: "이메일 주소",
  formFieldLabel__emailAddress_username: "이메일 주소 또는 사용자 이름",
  formFieldLabel__password: "비밀번호",
  formFieldLabel__username: "사용자 이름",
  formButtonPrimary: "계속",
  userButton: {
    action__manageAccount: "계정 관리",
    action__signOut: "로그아웃",
  },
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.url),
  title: {
    template: `%s | ${SITE_CONFIG.name}`,
    default: SITE_CONFIG.title,
  },
  description: SITE_CONFIG.description,
  keywords: SITE_CONFIG.keywords,
  openGraph: {
    type: "website",
    siteName: SITE_CONFIG.name,
    locale: "ko_KR",
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
    url: "/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: `${SITE_CONFIG.name} - 스포츠 팬 커뮤니티`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_CONFIG.description,
    description: SITE_CONFIG.description,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon-light-32x32.png" }, { url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-icon.png",
  },
}

// Viewport 설정 (별도 export)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkErrorBoundary>
      <ClerkProvider localization={koLocalization} dynamic>
        <html
          lang="ko"
          className={`${pretendard.variable} ${suit.variable} ${nanumPen.variable}`}
          suppressHydrationWarning
        >
          <head>
            {/* Google AdSense 계정 메타 태그 */}
            {process.env.NEXT_PUBLIC_ADSENSE_ID && (
              <meta name="google-adsense-account" content={process.env.NEXT_PUBLIC_ADSENSE_ID} />
            )}
            {/* PWA: standalone 모드 */}
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="default" />
            <meta name="apple-mobile-web-app-title" content="공놀이판" />
            {/* Preconnect: 크리티컬 외부 리소스 (DNS+TCP+TLS 선연결) */}
            <link
              rel="preconnect"
              href="https://ekysrlhdrapmsnrkytif.supabase.co"
              crossOrigin="anonymous"
            />
            <link rel="preconnect" href="https://clerk.gongnori.fan" crossOrigin="anonymous" />
            <link rel="preconnect" href="https://img.clerk.com" crossOrigin="anonymous" />
            <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
            {/* DNS Prefetch: 비크리티컬 외부 리소스 */}
            <link rel="dns-prefetch" href="https://i.ytimg.com" />
            <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
            <link rel="dns-prefetch" href="https://va.vercel-scripts.com" />
            {/* Google AdSense: 유휴 시점 + 최소 5초 후 로드 (LCP 보호) */}
            {process.env.NEXT_PUBLIC_ADSENSE_ID && (
              <Script
                id="adsense-delayed"
                strategy="lazyOnload"
                dangerouslySetInnerHTML={{
                  __html: `(function(){var l=false;function g(){if(l)return;l=true;var s=document.createElement('script');s.async=true;s.crossOrigin='anonymous';s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_ID}';document.head.appendChild(s)}var t=setTimeout(g,8000);if('requestIdleCallback' in window){requestIdleCallback(function(){if(performance.now()>5000)g();else setTimeout(g,5000-performance.now())},{timeout:10000})}})()`,
                }}
              />
            )}
          </head>
          <body className="safe-area-pb-tabbar font-sans antialiased" suppressHydrationWarning>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: jsonLd({
                  "@context": "https://schema.org",
                  "@type": "WebSite",
                  name: SITE_CONFIG.name,
                  url: SITE_CONFIG.url,
                  description: SITE_CONFIG.description,
                  inLanguage: "ko",
                  potentialAction: {
                    "@type": "SearchAction",
                    target: {
                      "@type": "EntryPoint",
                      urlTemplate: `${SITE_CONFIG.url}/search?q={search_term_string}`,
                    },
                    "query-input": "required name=search_term_string",
                  },
                }),
              }}
            />
            <Suspense fallback={null}>
              <ProfileSync />
            </Suspense>
            <AppShell>{children}</AppShell>
            <FloatingWriteButton />
            <MobileTabBar />
            <Toaster />
            <GlobalReportDialog />
            <PWARegister />
            <Analytics />
            {process.env.NEXT_PUBLIC_GA_ID && (
              <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
            )}
          </body>
        </html>
      </ClerkProvider>
    </ClerkErrorBoundary>
  )
}
