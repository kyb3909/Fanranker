"use client"

import { useState, useRef } from "react"
import { X, Upload, ImagePlus } from "lucide-react"

interface StickerUploadDialogProps {
  onClose: () => void
  onCreated: () => void
}

const BOARD_OPTIONS = [
  { value: "", label: "범용 (모든 게시판)" },
  { value: "football", label: "⚽ 축구" },
  { value: "baseball", label: "⚾ 야구" },
  { value: "basketball", label: "🏀 농구" },
  { value: "volleyball", label: "🏐 배구" },
  { value: "free-board", label: "🎭 자유" },
]

export function StickerUploadDialog({ onClose, onCreated }: StickerUploadDialogProps) {
  const [name, setName] = useState("")
  const [boardSlug, setBoardSlug] = useState("")
  const [tags, setTags] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      setError("이미지 파일만 업로드 가능합니다")
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("파일 크기는 5MB 이하여야 합니다")
      return
    }
    setError("")
    setFile(f)
    setPreview(URL.createObjectURL(f))
    if (!name) {
      const stem = f.name.replace(/\.[^.]+$/, "")
      // UUID/hash/스크린샷 자동 파일명은 의미 없는 이름이라 그대로 채우면 상점에 노이즈가 됨.
      const isAutoName =
        /^[a-f0-9]{8,}$/i.test(stem.replace(/[-_]/g, "")) ||
        /^(img|image|photo|pasted[\s_-]?image|screenshot|capture|스크린샷|사진|이미지)/i.test(stem)
      if (!isAutoName) setName(stem)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }

  const handleSubmit = async () => {
    if (!file || !name.trim()) return
    setIsSubmitting(true)
    setError("")

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("name", name.trim())
      if (boardSlug) formData.append("board_slug", boardSlug)
      if (tags.trim()) formData.append("tags", tags.trim())

      const res = await fetch("/api/stickers", { method: "POST", body: formData })
      const data = await res.json()

      if (res.ok) {
        onCreated()
      } else {
        setError(data.error || "업로드 실패")
      }
    } catch {
      setError("네트워크 오류")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border-border w-full max-w-md rounded-2xl border shadow-2xl">
        {/* 헤더 */}
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-foreground text-lg font-bold">🎨 스티커 만들기</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* 이미지 업로드 영역 */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 transition-all ${
              isDragOver
                ? "scale-[1.01] border-amber-500 bg-amber-500/5"
                : preview
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-border hover:bg-muted/30 hover:border-amber-500/50"
            }`}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob URL preview, not optimizable
              <img src={preview} alt="미리보기" className="h-32 w-32 rounded-lg object-contain" />
            ) : (
              <>
                <ImagePlus
                  className={`h-10 w-10 ${isDragOver ? "text-amber-500" : "text-muted-foreground"}`}
                />
                <div className="text-center">
                  <p className="text-muted-foreground text-sm font-medium">
                    이미지를 드래그하거나 클릭
                  </p>
                  <p className="text-muted-foreground/60 mt-0.5 text-xs">
                    PNG, JPG, GIF · 5MB 이하 · 256×256으로 리사이즈
                  </p>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          {/* 이름 */}
          <div>
            <label className="text-foreground mb-1 block text-sm font-semibold">
              스티커 이름 *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 눈물흘리는메시"
              maxLength={50}
              className="border-border bg-background w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* 게시판 */}
          <div>
            <label className="text-foreground mb-1 block text-sm font-semibold">카테고리</label>
            <select
              value={boardSlug}
              onChange={(e) => setBoardSlug(e.target.value)}
              className="border-border bg-background w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500"
            >
              {BOARD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 태그 */}
          <div>
            <label className="text-foreground mb-1 block text-sm font-semibold">태그</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="쉼표로 구분 (예: 축구,메시,골세리머니)"
              className="border-border bg-background w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* 안내 */}
          <div className="text-muted-foreground rounded-lg border border-amber-500/10 bg-amber-500/5 p-3 text-xs">
            <p>• 커뮤니티 추천 10표 달성 시 자동 승인됩니다</p>
            <p>• 승인 후 다른 유저가 구매할 때마다 50% 수익을 받습니다</p>
            <p>• 저작권/초상권 위반 스티커는 삭제될 수 있습니다</p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* 제출 */}
          <button
            onClick={handleSubmit}
            disabled={!file || !name.trim() || isSubmitting}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-sm font-bold text-white shadow-sm transition-all disabled:opacity-40"
          >
            {isSubmitting ? "업로드 중..." : "스티커 등록 신청"}
          </button>
        </div>
      </div>
    </div>
  )
}
