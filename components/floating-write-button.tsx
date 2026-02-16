"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Pencil } from "lucide-react"
import { SignedIn } from "@clerk/nextjs"

const HIDDEN_PATHS = ["/write", "/admin", "/sign-up", "/settings", "/games", "/art"]

export function FloatingWriteButton() {
  const pathname = usePathname()

  const shouldHide = HIDDEN_PATHS.some((p) => pathname.startsWith(p))
  if (shouldHide) return null

  return (
    <SignedIn>
      <Link
        href="/write"
        className="fixed right-4 bottom-[4.5rem] sm:bottom-6 z-40 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        aria-label="글쓰기"
      >
        <Pencil className="w-5 h-5" />
      </Link>
    </SignedIn>
  )
}
