"use client"

import { useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2, Camera } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface AvatarSectionProps {
  avatarUrl: string
  nickname: string
  fallbackChar: string
  onAvatarChanged: (url: string) => void
}

export function AvatarSection({
  avatarUrl,
  nickname,
  fallbackChar,
  onAvatarChanged,
}: AvatarSectionProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const compressImage = async (file: File, maxSize: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width)
            width = maxSize
          } else {
            width = Math.round((width * maxSize) / height)
            height = maxSize
          }
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")!
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("압축 실패"))),
          "image/webp",
          0.85
        )
      }
      img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."))
      img.src = URL.createObjectURL(file)
    })
  }

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "알림",
        description: "이미지 파일만 업로드할 수 있습니다.",
      })
      return
    }
    setUploading(true)
    try {
      const compressed = await compressImage(file, 512)
      const formData = new FormData()
      formData.append("file", new File([compressed], "avatar.webp", { type: "image/webp" }))
      const res = await fetch("/api/upload/image?type=avatar", { method: "POST", body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "업로드 실패")
      }
      const { url } = await res.json()
      const patchRes = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: url }),
      })
      if (!patchRes.ok) {
        const data = await patchRes.json().catch(() => ({}))
        throw new Error(data.error || "프로필 저장 실패")
      }
      onAvatarChanged(url)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "오류",
        description: err instanceof Error ? err.message : "프로필 사진 변경에 실패했습니다.",
      })
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <Camera className="text-primary h-5 w-5" />
        <h2 className="font-semibold">프로필 사진</h2>
      </div>

      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20">
          <AvatarImage src={avatarUrl} alt={nickname} />
          <AvatarFallback className="text-2xl">{fallbackChar}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleChange}
          />
          <p className="text-muted-foreground mb-2 text-sm">
            이미지 파일(JPG, PNG 등)을 선택하면 프로필 사진이 변경됩니다.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-2 h-4 w-4" />
            )}
            {uploading ? "업로드 중..." : "사진 변경"}
          </Button>
        </div>
      </div>
    </Card>
  )
}
