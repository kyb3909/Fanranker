"use client"

import { useMemo } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import { createSharedTipTapExtensions } from "@/lib/tiptap/extensions/shared"
import { cn } from "@/lib/utils"
import { transformBareImageUrlsInTipTapJSON } from "@/lib/tiptap/transform-bare-image-urls"

export interface TipTapContentProps {
  content: any // TipTap JSON
  className?: string
  /**
   * 읽기 밀도.
   * - "sm"(기본): 배너·어드민 미리보기 등 짧은 인용. 폭 제한 없음
   * - "base": 글 상세 본문. 16px + 68ch 측정폭 — 880px 를 14px 로 가로지르면
   *   한 줄에 85자가 넘어가 눈이 줄을 놓친다
   */
  size?: "sm" | "base"
}

/**
 * TipTap Content Renderer
 *
 * Renders TipTap JSON content in read-only mode.
 * Used for displaying posts with embedded content.
 */
export function TipTapContent({ content, className, size = "sm" }: TipTapContentProps) {
  const displayContent = useMemo(() => transformBareImageUrlsInTipTapJSON(content), [content])

  const editor = useEditor({
    extensions: createSharedTipTapExtensions(),
    content: displayContent || content || "",
    editable: false,
    immediatelyRender: false, // SSR hydration mismatch 방지
    editorProps: {
      attributes: {
        class: cn(
          "prose",
          // 크기와 측정폭을 한 쌍으로 묶는다 — 따로 주면 max-w 유틸끼리 충돌한다
          size === "base" ? "prose-base max-w-[68ch]" : "prose-sm max-w-none",
          className
        ),
      },
    },
  })

  if (!editor) {
    return null
  }

  return <EditorContent editor={editor} />
}
