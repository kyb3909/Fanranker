"use client"

import Link from "@/components/ui/app-link"
import { BookOpen } from "lucide-react"
import { Card } from "@/components/ui/card"

export function SidebarResources() {
  return (
    <footer className="mt-auto shrink-0" role="contentinfo">
      <Card className="border-border relative gap-0 overflow-hidden rounded-lg border py-0">
        <div className="px-4 py-3">
          {/* 다른 모듈 헤더(게시판·오늘의 설문)와 같은 11px 트래킹 라벨 — 버건디 회수
              (우측 레일은 헤더 반복 리듬으로 정돈되는 영역, 2026-08-20 감리 A-6) */}
          <h3
            className="flex items-center gap-2 text-[12px] font-bold tracking-[0.14em]"
            style={{ color: "var(--wc-ink)" }}
          >
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
