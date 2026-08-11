import type React from "react"
import { Suspense } from "react"
import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { Barlow_Condensed } from "next/font/google"
import Script from "next/script"
import { Analytics } from "@vercel/analytics/next"
import { GoogleAnalytics } from "@next/third-parties/google"
import { AttributionTracker } from "@/components/analytics/attribution-tracker"
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
// 시안 A "매치데이" 디자인 레이어 — 다크 존 팔레트 + 콘덴스드 숫자 + 썸네일 트리트먼트.
// 전부 --gn-* / .gn-* 네임스페이스라 기존 --wc-* 라이트 토큰과 충돌하지 않는다.
import "./a-tokens.css"

// 본문/UI 한글 폰트: Pretendard Variable — KS X 1001 한글(2,350자) + 라틴 서브셋, 302 KB.
//
// ⚠️ 2026-07-28 정정: 직전까지 여기 있던 파일은 Pretendard **Std**(라틴 전용)였다.
//    cmap 검사 결과 한글 음절 0/11,172 → 285 KB 를 받아놓고 한글 본문은 전부
//    시스템 폴백(맑은 고딕 / Apple SD Gothic Neo)으로 렌더되고 있었다.
//    정품 Variable 1.3.9 로 교체하고 wght 축을 400–800 으로 클립 + 서브셋했다:
//      instancer.instantiateVariableFont(f, {"wght": (400, 800)}, optimize=True)
//      pyftsubset --text-file=<KS X 1001 + latin> --flavor=woff2 \
//        --layout-features='kern,liga,tnum,pnum' --no-hinting
//    (검증: fontTools 로 U+AC00 이 cmap 에 있는지 확인. 없으면 한글이 폴백된다)
const pretendard = localFont({
  src: "../public/fonts/PretendardVariable.woff2",
  display: "swap",
  variable: "--font-pretendard",
  weight: "400 800",
  // size-adjust/ascent 폴백 메트릭 자동 생성 → Pretendard swap 시 본문 텍스트 리플로우(CLS) 최소화.
  adjustFontFallback: "Arial",
})

// 제목/디스플레이 한글 폰트: SUIT (정적 wght=700 인스턴스).
// 본문 Pretendard와 듀얼 시스템 (NYT/Verge/Pitchfork 식 에디토리얼 톤).
// font-title 클래스가 항상 font-bold(700) 만 사용하므로 Variable axis 불필요.
// pyftsubset로 KS X 1001 한글(2,668자) + Latin + CJK 기호로 서브셋팅: 624KB → 173KB.
// ⚠️ display 를 optional → swap 으로 바꿈 (2026-07-28). optional 은 캐시에 없으면
//    아예 스왑하지 않아서, 첫 방문자에게는 제목 폰트가 통째로 적용되지 않았다.
//    preload: false 는 유지 — 헤딩 전용이라 LCP 크리티컬 패스에서 뺀다.
const suit = localFont({
  src: "../public/fonts/SUIT-700.woff2",
  display: "swap",
  variable: "--font-suit",
  weight: "700",
  preload: false,
})

// 붓글씨(Nanum Brush/Pen)는 제거했다 — next/font 타입이 latin 서브셋만 허용해서
// 한글 헤드라인에 쓰면 글리프가 없어 통째로 폴백 산세리프로 렌더된다.
// 그 자리는 아래 어그로체 Bold 가 맡는다.

// 디스플레이(브랜드 헤드라인) 한글: 어그로체 Bold (SB Aggro) — 샌드박스 무료 배포.
// 각진 모서리 + 짧고 굵은 획의 스포츠/스트리트 체. 본문(Pretendard)과 골격이 완전히
// 달라서 크기를 안 키워도 "제목"으로 읽힌다. 다크 밴드 헤드라인·푸터 로고 등 짧은 문구 전용.
// KS X 1001(2,350자) + 라틴 + 호환자모로 서브셋: 210 KB → 91 KB.
//   pyftsubset AggroB.ttf --text-file=charset.txt --flavor=woff2 \
//     --layout-features='' --no-hinting --desubroutinize
// display: swap + preload 없음 — 장식 슬롯이라 첫 페인트를 막지 않는다.
// ⚠️ 라이선스: 공식 페이지(sandbox.co.kr/font)가 "모든 사용자에게 무료 제공, 자유롭게
//    수정·재배포 가능"으로 명시하나, 라이선스 PDF 전문은 확인하지 못했다(CID 인코딩).
//    외부 배포 전 aggro-font@sandbox.co.kr 로 임베딩 조건 확인 권장.
// ⚠️ 합성 볼드 금지: 이미 Bold 이므로 font-weight 를 더 얹지 말 것.
const aggro = localFont({
  src: "../public/fonts/Aggro-Bold.woff2",
  weight: "700",
  variable: "--font-display-ko",
  display: "swap",
  preload: false,
})

// 시각·스코어·카운트다운용 콘덴스드 라틴 (시안 A). 한글은 Pretendard 그대로.
// 숫자 슬롯에만 쓰이므로 preload 없이 swap — 폭이 좁아 리플로우 영향도 작다.
const barlowCondensed = Barlow_Condensed({
  // 700 한 웨이트만 — 600/800 은 실사용처가 없어 65.6 KB → 21.9 KB
  weight: "700",
  subsets: ["latin"],
  variable: "--font-cond",
  display: "swap",
  preload: false,
})

// 게이트 문구는 금지형("~이 필요해요") 대신 혜택형 — 가입할 이유를 문 앞에서 말한다
// (2026-07-30 워룸: 가치 제안이 사이트에 0개였던 문제의 일부)
const koLocalization = {
  signIn: {
    start: {
      title: "로그인",
      subtitle: "승부예측으로 점수를 쌓아보세요",
      actionText: "계정이 없으신가요?",
      actionLink: "가입하기",
    },
  },
  signUp: {
    start: {
      title: "회원가입",
      subtitle: "가입하고 승부예측으로 점수를 쌓아보세요",
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
  // PWA / AdSense 계정 메타 — 수동 <head> 제거(Metadata API 충돌)에 따라 metadata 로 이전.
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "공놀이판",
    ...(process.env.NEXT_PUBLIC_ADSENSE_ID
      ? { "google-adsense-account": process.env.NEXT_PUBLIC_ADSENSE_ID }
      : {}),
  },
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
    title: SITE_CONFIG.title,
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
          className={`${pretendard.variable} ${suit.variable} ${barlowCondensed.variable} ${aggro.variable}`}
          suppressHydrationWarning
        >
          {/*
            수동 <head> 제거: App Router 에서 명시적 <head> JSX 는 Metadata API 출력
            (title/description/og/twitter/canonical/manifest)을 통째로 덮어써 누락시킴.
            아래 link/Script 는 React 19 + Next 15 가 자동으로 <head>로 hoist.
            PWA / AdSense 계정 메타는 위 metadata.other 로 이전.
          */}
          <body className="safe-area-pb-tabbar font-sans antialiased" suppressHydrationWarning>
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
            <AttributionTracker />
          </body>
        </html>
      </ClerkProvider>
    </ClerkErrorBoundary>
  )
}
