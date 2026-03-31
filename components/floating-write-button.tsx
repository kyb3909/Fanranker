"use client"

import Link from "@/components/ui/app-link"
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
        className="bg-primary text-primary-foreground hover:bg-primary/90 fixed right-4 bottom-[4.5rem] z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors sm:bottom-6"
        aria-label="글쓰기"
      >
        <Pencil className="h-5 w-5" />
      </Link>
    </SignedIn>
  )
}
