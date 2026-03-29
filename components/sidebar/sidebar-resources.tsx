"use client"

import Link from "next/link"
import { BookOpen } from "lucide-react"
import { Card } from "@/components/ui/card"

export function SidebarResources() {
  return (
    <footer className="mt-auto shrink-0" role="contentinfo">
      <Card className="border-border relative gap-0 overflow-hidden rounded-xl border py-0 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
        <div className="via-primary/60 absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-transparent to-transparent" />
        <div className="px-4 py-3">
          <h3 className="text-primary flex items-center gap-2 text-[14px] font-bold">
            <BookOpen className="h-3.5 w-3.5" />
            리소스
          </h3>
        </div>
        <div className="py-1">
          {[
            { href: "/about", label: "회사 소개" },
            { href: "/terms", label: "이용약관" },
            { href: "/content-policy", label: "게시물 운영정책" },
            { href: "/privacy", label: "개인정보처리방침" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className="hover:bg-muted/40 group text-foreground group-hover:text-primary flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </Card>
    </footer>
  )
}
