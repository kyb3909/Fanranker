"use client"

import { useMemo } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import { createSharedTipTapExtensions } from "@/lib/tiptap/extensions/shared"
import { cn } from "@/lib/utils"
import { transformBareImageUrlsInTipTapJSON } from "@/lib/tiptap/transform-bare-image-urls"

export interface TipTapContentProps {
  content: any // TipTap JSON
  className?: string
}

/**
 * TipTap Content Renderer
 *
 * Renders TipTap JSON content in read-only mode.
 * Used for displaying posts with embedded content.
 */
export function TipTapContent({ content, className }: TipTapContentProps) {
  const displayContent = useMemo(() => transformBareImageUrlsInTipTapJSON(content), [content])

  const editor = useEditor({
    extensions: createSharedTipTapExtensions(),
    content: displayContent || content || "",
    editable: false,
    immediatelyRender: false, // SSR hydration mismatch 방지
    editorProps: {
      attributes: {
        class: cn(
          // 본문 크기 — 커뮤니티 글에 맞춰 작게(prose-sm) 고정. 큰 화면 업스케일 안 함.
          "prose prose-sm mx-auto",
          "max-w-none",
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
