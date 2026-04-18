"use client"

import React, { forwardRef, useImperativeHandle } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import Placeholder from "@tiptap/extension-placeholder"
import { createSharedTipTapExtensions } from "@/lib/tiptap/extensions/shared"
import { EmbedPaste } from "@/lib/tiptap/extensions/embed-paste"
import { cn } from "@/lib/utils"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Minus,
  ImageIcon,
  Loader2,
} from "lucide-react"

export interface TipTapEditorProps {
  content?: string | unknown // string 또는 TipTap JSON
  onChange?: (json: unknown) => void
  onEmbedLoading?: (loading: boolean) => void
  placeholder?: string
  className?: string
  editable?: boolean
}

export type TipTapEditorHandle = {
  /** 업로드된 이미지 URL들을 커서 위치에 순서대로 삽입 */
  insertImagesFromUrls: (urls: string[]) => void
}

/**
 * TipTap Editor Component with oEmbed support
 *
 * Features:
 * - Automatic URL to embed conversion (YouTube, Instagram, X)
 * - Rich text editing with StarterKit
 * - JSON output for Supabase storage
 * - Toolbar with formatting options
 */
export const TipTapEditor = forwardRef<TipTapEditorHandle, TipTapEditorProps>(function TipTapEditor(
  {
    content,
    onChange,
    onEmbedLoading,
    placeholder = "내용을 입력하세요...",
    className,
    editable = true,
  },
  ref
) {
  const [isUploadingImage, setIsUploadingImage] = React.useState(false)
  const imageInputRef = React.useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      ...createSharedTipTapExtensions(),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
      EmbedPaste.configure({
        onEmbedLoading,
      }),
    ],
    content: content || "",
    editable,
    immediatelyRender: false, // SSR hydration mismatch 방지
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getJSON())
      }
    },
    editorProps: {
      attributes: {
        class: cn("focus:outline-none", className),
      },
    },
  })

  const handleImageUpload = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !editor) return
      // input 초기화 (같은 파일 재선택 가능)
      e.target.value = ""

      if (!file.type.startsWith("image/")) {
        toast({
          variant: "destructive",
          title: "알림",
          description: "이미지 파일만 업로드할 수 있습니다.",
        })
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "알림",
          description: "파일 크기는 10MB를 초과할 수 없습니다.",
        })
        return
      }

      setIsUploadingImage(true)
      try {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch("/api/upload/image", { method: "POST", body: formData })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "이미지 업로드에 실패했습니다.")
        }
        const { url } = await res.json()
        editor.chain().focus().setImage({ src: url, alt: file.name }).run()
      } catch (err) {
        toast({
          variant: "destructive",
          title: "오류",
          description: err instanceof Error ? err.message : "이미지 업로드 중 오류가 발생했습니다.",
        })
      } finally {
        setIsUploadingImage(false)
      }
    },
    [editor]
  )

  useImperativeHandle(
    ref,
    () => ({
      insertImagesFromUrls: (urls: string[]) => {
        if (!editor || urls.length === 0) return
        const nodes = urls.flatMap((src) => [
          { type: "image" as const, attrs: { src, alt: "" } },
          { type: "paragraph" as const },
        ])
        editor.chain().focus().insertContent(nodes).run()
      },
    }),
    [editor]
  )

  if (!editor) {
    return (
      <div className="border-border bg-background flex min-h-[300px] items-center justify-center rounded-lg border p-4">
        <p className="text-muted-foreground">에디터를 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="border-border bg-background overflow-hidden rounded-lg border">
      {/* Toolbar */}
      {editable && (
        <div className="border-border bg-muted/30 flex flex-wrap items-center gap-1 border-b p-2">
          {/* Undo/Redo */}
          <Toggle
            size="sm"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            aria-label="실행 취소"
          >
            <Undo className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            aria-label="다시 실행"
          >
            <Redo className="h-4 w-4" />
          </Toggle>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Headings */}
          <Toggle
            size="sm"
            pressed={editor.isActive("heading", { level: 1 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            aria-label="제목 1"
          >
            <Heading1 className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("heading", { level: 2 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            aria-label="제목 2"
          >
            <Heading2 className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("heading", { level: 3 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            aria-label="제목 3"
          >
            <Heading3 className="h-4 w-4" />
          </Toggle>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Text Formatting */}
          <Toggle
            size="sm"
            pressed={editor.isActive("bold")}
            onPressedChange={() => editor.chain().focus().toggleBold().run()}
            aria-label="굵게"
          >
            <Bold className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("italic")}
            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
            aria-label="기울임"
          >
            <Italic className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("underline")}
            onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
            aria-label="밑줄"
          >
            <UnderlineIcon className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("strike")}
            onPressedChange={() => editor.chain().focus().toggleStrike().run()}
            aria-label="취소선"
          >
            <Strikethrough className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("code")}
            onPressedChange={() => editor.chain().focus().toggleCode().run()}
            aria-label="인라인 코드"
          >
            <Code className="h-4 w-4" />
          </Toggle>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Text Align */}
          <Toggle
            size="sm"
            pressed={editor.isActive({ textAlign: "left" })}
            onPressedChange={() => editor.chain().focus().setTextAlign("left").run()}
            aria-label="왼쪽 정렬"
          >
            <AlignLeft className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive({ textAlign: "center" })}
            onPressedChange={() => editor.chain().focus().setTextAlign("center").run()}
            aria-label="가운데 정렬"
          >
            <AlignCenter className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive({ textAlign: "right" })}
            onPressedChange={() => editor.chain().focus().setTextAlign("right").run()}
            aria-label="오른쪽 정렬"
          >
            <AlignRight className="h-4 w-4" />
          </Toggle>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Lists */}
          <Toggle
            size="sm"
            pressed={editor.isActive("bulletList")}
            onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
            aria-label="글머리 기호 목록"
          >
            <List className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("orderedList")}
            onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
            aria-label="번호 매기기 목록"
          >
            <ListOrdered className="h-4 w-4" />
          </Toggle>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Block Elements */}
          <Toggle
            size="sm"
            pressed={editor.isActive("blockquote")}
            onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
            aria-label="인용"
          >
            <Quote className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            aria-label="구분선"
          >
            <Minus className="h-4 w-4" />
          </Toggle>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* 이미지 삽입 */}
          <Toggle
            size="sm"
            onClick={() => imageInputRef.current?.click()}
            disabled={isUploadingImage}
            aria-label="이미지 삽입"
          >
            {isUploadingImage ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
          </Toggle>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Editor Content */}
      <EditorContent editor={editor} className="tiptap-editor" />
    </div>
  )
})
