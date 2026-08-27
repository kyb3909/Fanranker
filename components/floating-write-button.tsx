"use client"

import Link from "@/components/ui/app-link"
import { usePathname } from "next/navigation"
import { Pencil } from "lucide-react"
import { SignedIn, SignedOut, useClerk } from "@clerk/nextjs"

const HIDDEN_PATHS = [
  "/write",
  "/admin",
  "/sign-up",
  "/settings",
  "/games",
  "/art",
  "/metaverse",
  "/stadium",
]

/**
 * 글쓰기 FAB — 우하단 floating action button.
 *
 * 발견성 핵심 — 사용자 메뉴 드롭다운에 묻혀있던 글쓰기를 1-step 으로.
 * 비로그인 도 표시 (sign-in 모달로 유도, 가입 동기 자연스럽게).
 *
 * 동작:
 *   로그인 → /write (community 컨텍스트면 prefill: /write?community=...)
 *   비로그인 → openSignIn 모달, 로그인 후 글쓰기로 redirect
 */
export function FloatingWriteButton() {
  const pathname = usePathname()
  const { openSignIn } = useClerk()

  const shouldHide = HIDDEN_PATHS.some((p) => pathname.startsWith(p))
  if (shouldHide) return null

  // community 안에서 클릭하면 그 community 로 prefill
  const communityMatch = pathname.match(/^\/community\/([^/]+)/)
  const writeHref = communityMatch ? `/write?community=${communityMatch[1]}` : "/write"

  const baseClass =
    "bg-primary text-primary-foreground hover:bg-primary/90 fixed right-4 bottom-[4.5rem] z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors sm:bottom-6"

  return (
    <>
      <SignedIn>
        <Link href={writeHref} className={baseClass} aria-label="글쓰기">
          <Pencil className="h-5 w-5" />
        </Link>
      </SignedIn>
      <SignedOut>
        <button
          type="button"
          onClick={() => openSignIn({ redirectUrl: writeHref })}
          className={baseClass}
          aria-label="글쓰기 (로그인 필요)"
        >
          <Pencil className="h-5 w-5" />
        </button>
      </SignedOut>
    </>
  )
}
