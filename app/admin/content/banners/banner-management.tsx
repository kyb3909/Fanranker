"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import {
  Plus,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  ImageIcon,
  Loader2,
  ExternalLink,
  Pencil,
} from "lucide-react"

interface Banner {
  id: string
  title: string
  description: string | null
  image_url: string | null
  link_url: string | null
  gradient: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

const GRADIENT_PRESETS = [
  { label: "블루", value: "from-blue-600 to-indigo-700" },
  { label: "오렌지", value: "from-amber-500 to-orange-600" },
  { label: "그린", value: "from-emerald-500 to-teal-600" },
  { label: "퍼플", value: "from-purple-500 to-violet-700" },
  { label: "레드", value: "from-rose-500 to-red-600" },
  { label: "다크", value: "from-gray-700 to-gray-900" },
]

export function BannerManagement({ initialBanners }: { initialBanners: Banner[] }) {
  const [banners, setBanners] = useState<Banner[]>(initialBanners)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: "",
    description: "",
    image_url: "",
    link_url: "",
    gradient: GRADIENT_PRESETS[0].value,
    is_active: true,
  })

  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      image_url: "",
      link_url: "",
      gradient: GRADIENT_PRESETS[0].value,
      is_active: true,
    })
    setEditing(null)
    setCreating(false)
  }

  const startEdit = (banner: Banner) => {
    setForm({
      title: banner.title,
      description: banner.description ?? "",
      image_url: banner.image_url ?? "",
      link_url: banner.link_url ?? "",
      gradient: banner.gradient ?? GRADIENT_PRESETS[0].value,
      is_active: banner.is_active,
    })
    setEditing(banner.id)
    setCreating(false)
  }

  const startCreate = () => {
    resetForm()
    setCreating(true)
  }

  const handleUpload = async (file: File, bannerId?: string) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload/image", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (bannerId) {
        // 기존 배너에 이미지 바로 저장
        const patchRes = await fetch(`/api/admin/content/banners/${bannerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: data.url }),
        })
        if (patchRes.ok) {
          setBanners((prev) =>
            prev.map((b) => (b.id === bannerId ? { ...b, image_url: data.url } : b))
          )
        }
      } else {
        // 새 배너 폼에 URL 설정
        setForm((prev) => ({ ...prev, image_url: data.url }))
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "업로드 실패")
    } finally {
      setUploading(false)
      setUploadTargetId(null)
    }
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      alert("제목을 입력하세요.")
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const res = await fetch(`/api/admin/content/banners/${editing}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setBanners((prev) => prev.map((b) => (b.id === editing ? data.banner : b)))
      } else {
        const nextOrder = banners.length > 0 ? Math.max(...banners.map((b) => b.sort_order)) + 1 : 0
        const res = await fetch("/api/admin/content/banners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, sort_order: nextOrder }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setBanners((prev) => [...prev, data.banner])
      }
      resetForm()
    } catch (err) {
      alert(err instanceof Error ? err.message : "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("이 배너를 삭제하시겠습니까?")) return
    const res = await fetch(`/api/admin/content/banners/${id}`, { method: "DELETE" })
    if (res.ok) {
      setBanners((prev) => prev.filter((b) => b.id !== id))
      if (editing === id) resetForm()
    }
  }

  const toggleActive = async (banner: Banner) => {
    const res = await fetch(`/api/admin/content/banners/${banner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !banner.is_active }),
    })
    if (res.ok) {
      setBanners((prev) =>
        prev.map((b) => (b.id === banner.id ? { ...b, is_active: !b.is_active } : b))
      )
    }
  }

  const moveOrder = async (id: string, direction: "up" | "down") => {
    const idx = banners.findIndex((b) => b.id === id)
    if (idx < 0) return
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= banners.length) return

    const updated = [...banners]
    const tempOrder = updated[idx].sort_order
    updated[idx].sort_order = updated[swapIdx].sort_order
    updated[swapIdx].sort_order = tempOrder
    ;[updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]]

    setBanners(updated)

    await Promise.all([
      fetch(`/api/admin/content/banners/${updated[idx].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: updated[idx].sort_order }),
      }),
      fetch(`/api/admin/content/banners/${updated[swapIdx].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: updated[swapIdx].sort_order }),
      }),
    ])
  }

  return (
    <div className="space-y-6">
      {/* 배너 목록 */}
      <div className="space-y-3">
        {banners.length === 0 && !creating && (
          <div className="bg-muted/40 rounded-lg py-12 text-center">
            <ImageIcon className="text-muted-foreground mx-auto h-10 w-10" />
            <p className="text-muted-foreground mt-2 text-sm">등록된 배너가 없습니다.</p>
          </div>
        )}

        {banners.map((banner, idx) => (
          <div
            key={banner.id}
            className={`bg-card border-border rounded-lg border p-4 ${
              !banner.is_active ? "opacity-50" : ""
            }`}
          >
            <div className="flex items-start gap-4">
              {/* 순서 조절 */}
              <div className="flex flex-col items-center gap-1 pt-1">
                <button
                  onClick={() => moveOrder(banner.id, "up")}
                  disabled={idx === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="위로"
                >
                  <GripVertical className="h-4 w-4 scale-x-[-1] rotate-90" />
                </button>
                <span className="text-muted-foreground text-xs">{idx + 1}</span>
                <button
                  onClick={() => moveOrder(banner.id, "down")}
                  disabled={idx === banners.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="아래로"
                >
                  <GripVertical className="h-4 w-4 rotate-90" />
                </button>
              </div>

              {/* 미리보기 */}
              <div className="h-20 w-36 shrink-0 overflow-hidden rounded-md">
                {banner.image_url ? (
                  <Image
                    src={banner.image_url}
                    alt={banner.title}
                    width={144}
                    height={80}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className={`bg-gradient-to-r ${banner.gradient || "from-blue-600 to-indigo-700"} flex h-full w-full items-center justify-center`}
                  >
                    <span className="text-xs font-medium text-white/80">그라데이션</span>
                  </div>
                )}
              </div>

              {/* 정보 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-foreground truncate text-sm font-semibold">{banner.title}</h3>
                  {!banner.is_active && (
                    <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">
                      비활성
                    </span>
                  )}
                </div>
                {banner.description && (
                  <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                    {banner.description}
                  </p>
                )}
                {banner.link_url && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-blue-500">
                    <ExternalLink className="h-3 w-3" />
                    <span className="truncate">{banner.link_url}</span>
                  </p>
                )}
              </div>

              {/* 액션 */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setUploadTargetId(banner.id)
                    fileInputRef.current?.click()
                  }}
                  disabled={uploading}
                  title="이미지 업로드"
                >
                  {uploading && uploadTargetId === banner.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => startEdit(banner)}
                  title="수정"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => toggleActive(banner)}
                  title={banner.is_active ? "비활성화" : "활성화"}
                >
                  {banner.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600"
                  onClick={() => handleDelete(banner.id)}
                  title="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 생성/수정 폼 */}
      {(creating || editing) && (
        <div className="bg-card border-border space-y-4 rounded-lg border p-5">
          <h3 className="text-foreground text-sm font-semibold">
            {editing ? "배너 수정" : "새 배너 추가"}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">
                제목 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="배너 제목"
                className="bg-secondary border-border text-foreground w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">링크 URL</label>
              <input
                type="url"
                value={form.link_url}
                onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
                placeholder="https://..."
                className="bg-secondary border-border text-foreground w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">설명</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="배너 설명 (이미지 배너에서는 표시되지 않음)"
              rows={2}
              className="bg-secondary border-border text-foreground w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">이미지 URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.image_url}
                onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                placeholder="이미지 URL (없으면 그라데이션+텍스트 표시)"
                className="bg-secondary border-border text-foreground flex-1 rounded-md border px-3 py-2 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setUploadTargetId(null)
                  fileInputRef.current?.click()
                }}
                disabled={uploading}
              >
                {uploading && !uploadTargetId ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="mr-1 h-4 w-4" />
                )}
                업로드
              </Button>
            </div>
          </div>

          {/* 이미지 미리보기 */}
          {form.image_url && (
            <div className="h-32 w-full overflow-hidden rounded-md">
              <Image
                src={form.image_url}
                alt="배너 미리보기"
                width={800}
                height={200}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          <div>
            <label className="text-foreground mb-2 block text-xs font-medium">
              그라데이션 (이미지 없을 때 사용)
            </label>
            <div className="flex flex-wrap gap-2">
              {GRADIENT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setForm((f) => ({ ...f, gradient: preset.value }))}
                  className={`bg-gradient-to-r ${preset.value} h-8 w-16 rounded-md transition-all ${
                    form.gradient === preset.value
                      ? "ring-primary ring-2 ring-offset-2"
                      : "ring-1 ring-white/20"
                  }`}
                  title={preset.label}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="banner-active"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="accent-primary"
            />
            <label htmlFor="banner-active" className="text-foreground text-sm">
              활성화
            </label>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {editing ? "수정 완료" : "추가"}
            </Button>
            <Button variant="outline" size="sm" onClick={resetForm}>
              취소
            </Button>
          </div>
        </div>
      )}

      {/* 새 배너 추가 버튼 */}
      {!creating && !editing && (
        <Button variant="outline" onClick={startCreate} className="w-full">
          <Plus className="mr-2 h-4 w-4" />새 배너 추가
        </Button>
      )}

      {/* 숨겨진 파일 인풋 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            handleUpload(file, uploadTargetId ?? undefined)
          }
          e.target.value = ""
        }}
      />
    </div>
  )
}
