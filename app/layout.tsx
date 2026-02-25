import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ClerkProvider } from "@clerk/nextjs"
import { ClerkErrorBoundary } from "@/components/clerk-error-boundary"
import { ProfileSync } from "@/components/profile-sync"
import { MobileTabBar } from "@/components/mobile-tab-bar"
import { FloatingWriteButton } from "@/components/floating-write-button"
import { SITE_CONFIG, jsonLd } from "@/lib/seo"
import "./globals.css"

const koLocalization = {
  signIn: {
    start: {
      title: "로그인",
      subtitle: "계속하려면 로그인하세요",
      actionText: "계정이 없으신가요?",
      actionLink: "가입하기",
    },
  },
  signUp: {
    start: {
      title: "회원가입",
      subtitle: "계속하려면 가입하세요",
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

// 폰트 최적화: display: swap으로 FOUT 방지, preload 활성화
const geistSans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-sans",
  preload: true,
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
  preload: true,
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.url),
  title: {
    template: `%s | ${SITE_CONFIG.name}`,
    default: SITE_CONFIG.description,
  },
  description: SITE_CONFIG.description,
  keywords: SITE_CONFIG.keywords,
  openGraph: {
    type: "website",
    siteName: SITE_CONFIG.name,
    locale: "ko_KR",
    title: SITE_CONFIG.description,
    description: SITE_CONFIG.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_CONFIG.description,
    description: SITE_CONFIG.description,
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
  themeColor: "#ffffff",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkErrorBoundary>
      <ClerkProvider localization={koLocalization}>
        <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
          <head>
            {/* DNS Prefetch & Preconnect: 외부 리소스 로딩 최적화 */}
            <link rel="dns-prefetch" href="https://i.ytimg.com" />
            <link rel="dns-prefetch" href="https://img.clerk.com" />
            <link rel="dns-prefetch" href="https://definite-mollusk-7.clerk.accounts.dev" />
            <link rel="preconnect" href="https://i.ytimg.com" crossOrigin="anonymous" />
            <link rel="preconnect" href="https://img.clerk.com" crossOrigin="anonymous" />
            <link
              rel="preconnect"
              href="https://definite-mollusk-7.clerk.accounts.dev"
              crossOrigin="anonymous"
            />
            {/* Supabase 연결 최적화 */}
            {process.env.NEXT_PUBLIC_SUPABASE_URL && (
              <>
                <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
                <link
                  rel="preconnect"
                  href={process.env.NEXT_PUBLIC_SUPABASE_URL}
                  crossOrigin="anonymous"
                />
              </>
            )}
          </head>
          <body className={`pb-14 font-sans antialiased sm:pb-0`}>
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
            {/* 스킵 링크: 키보드·스크린리더 사용자 본문 바로가기 (Lighthouse 접근성) */}
            <a
              href="#main-content"
              className="bg-primary text-primary-foreground focus:ring-ring fixed top-4 left-4 z-[100] -translate-y-[200%] rounded-md px-4 py-2 text-sm font-medium shadow-md transition-transform focus:translate-y-0 focus:ring-2 focus:outline-none"
            >
              본문으로 건너뛰기
            </a>
            <ProfileSync />
            {children}
            <FloatingWriteButton />
            <MobileTabBar />
            <Analytics />
          </body>
        </html>
      </ClerkProvider>
    </ClerkErrorBoundary>
  )
}
