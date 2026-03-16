"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import TiptapImage from "@tiptap/extension-image"
import { Embed } from "@/lib/tiptap/extensions/embed"
import { cn } from "@/lib/utils"

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
  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapImage.configure({
        HTMLAttributes: {
          class: "tiptap-image",
        },
      }),
      Embed.configure({
        HTMLAttributes: {
          class: "embed-node",
        },
      }),
    ],
    content: content || "",
    editable: false,
    immediatelyRender: false, // SSR hydration mismatch 방지
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm sm:prose-base lg:prose-lg xl:prose-2xl mx-auto",
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
