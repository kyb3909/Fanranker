"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Megaphone, ChevronDown, ChevronUp, ArrowRight } from "lucide-react"

// 본문이 TipTap JSON 인 공지에서만 로드 (홈 번들에 tiptap 을 항상 끌고 오지 않도록 동적 import)
const TipTapContent = dynamic(
  () => import("@/components/editor/tiptap-content").then((m) => m.TipTapContent),
  { ssr: false }
)

export interface GlobalNotice {
  id: string
  title: string
  /** 본문 — 문자열(평문) 또는 TipTap JSON. 없을 수도 있음. */
  content?: unknown
}

const STORAGE_PREFIX = "gn-collapsed:"

/**
 * 담벼락(홈) 최상단 전체 공지 — 관리자가 is_global_notice 로 고정한 사이트 공지글.
 * 정렬 무관 항상 상단. 골드 오우라로 강조 + 펼쳐서 본문 인라인 열람.
 * 한 번 접으면 그 공지(id)는 localStorage 에 기억되어 다음 방문 때도 접힌 채 표시.
 */
export function GlobalNoticeBanner({ notices }: { notices: GlobalNotice[] }) {
  if (!notices?.length) return null
  return (
    <div className="space-y-2">
      {notices.map((n) => (
        <NoticeCard key={n.id} notice={n} />
      ))}
    </div>
  )
}

function NoticeCard({ notice }: { notice: GlobalNotice }) {
  // 기본은 펼침(내용 보이게). mount 후 localStorage 에 접힘 기록이 있으면 접는다.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_PREFIX + notice.id) === "1") setCollapsed(true)
    } catch {
      /* localStorage 접근 불가 — 무시 */
    }
  }, [notice.id])

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        if (next) localStorage.setItem(STORAGE_PREFIX + notice.id, "1")
        else localStorage.removeItem(STORAGE_PREFIX + notice.id)
      } catch {
        /* 무시 */
      }
      return next
    })
  }

  const hasContent =
    notice.content !== undefined && notice.content !== null && notice.content !== ""

  return (
    <div
      className="notice-aura overflow-hidden rounded-xl"
      style={{ background: "var(--wc-card, #ffffff)", border: "1px solid var(--wc-gold, #E7C66B)" }}
    >
      {/* 헤더 — 항상 표시. 클릭하면 펼치기/접기 */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <Megaphone className="h-4 w-4 shrink-0" style={{ color: "#B5841E" }} aria-hidden />
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-extrabold"
          style={{ background: "#B5841E", color: "#fff" }}
        >
          공지
        </span>
        <span
          className="min-w-0 flex-1 text-[15px] font-bold"
          style={{ color: "var(--wc-ink, #2A1A1F)" }}
        >
          {notice.title}
        </span>
        {collapsed ? (
          <ChevronDown className="h-5 w-5 shrink-0" style={{ color: "#B5841E" }} aria-hidden />
        ) : (
          <ChevronUp className="h-5 w-5 shrink-0" style={{ color: "#B5841E" }} aria-hidden />
        )}
      </button>

      {/* 본문 — 펼쳤을 때만 */}
      {!collapsed && (
        <div className="px-4 pb-4">
          <div
            className="border-t pt-3"
            style={{ borderColor: "var(--wc-gold, #E7C66B)", opacity: 0.99 }}
          >
            {hasContent ? (
              typeof notice.content === "string" ? (
                <p
                  className="text-[14px] whitespace-pre-wrap"
                  style={{
                    color: "var(--wc-ink, #2A1A1F)",
                    lineHeight: 1.7,
                    wordBreak: "keep-all",
                  }}
                >
                  {notice.content}
                </p>
              ) : (
                <TipTapContent content={notice.content} />
              )
            ) : null}
            <Link
              href={`/post/${notice.id}`}
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold no-underline"
              style={{ color: "#B5841E" }}
            >
              글 전체 보기
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
