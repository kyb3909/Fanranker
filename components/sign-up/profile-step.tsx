import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronRight, User, Camera, Loader2 } from "lucide-react"
import Image from "next/image"

interface ProfileStepProps {
  nickname: string
  setNickname: (v: string) => void
  nicknameError: string | null
  bio: string
  setBio: (v: string) => void
  avatarUrl: string | null
  avatarUploading: boolean
  onAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onNext: () => void
  onBack: () => void
}

export function ProfileStep({
  nickname,
  setNickname,
  nicknameError,
  bio,
  setBio,
  avatarUrl,
  avatarUploading,
  onAvatarUpload,
  onNext,
  onBack,
}: ProfileStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canProceed = nickname.trim().length >= 2 && !nicknameError

  return (
    <div className="p-6">
      <h2 className="text-foreground mb-1 text-lg font-bold">프로필 설정</h2>
      <p className="text-muted-foreground mb-5 text-sm">
        커뮤니티에서 사용할 프로필을 설정해주세요.
      </p>

      {/* Avatar */}
      <div className="mb-5 flex justify-center">
        <div className="relative">
          <div className="bg-muted border-border flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="프로필 사진"
                width={80}
                height={80}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="text-muted-foreground h-8 w-8" />
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="bg-primary text-primary-foreground hover:bg-primary/90 absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full shadow-md transition-colors"
          >
            {avatarUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onAvatarUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Nickname */}
      <div className="mb-4">
        <label className="text-foreground mb-1.5 block text-sm font-medium">
          닉네임 <span className="text-destructive">*</span>
        </label>
        <Input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="한글, 영문, 숫자 (2~20자)"
          maxLength={20}
          aria-invalid={!!nicknameError}
        />
        {nicknameError && <p className="text-destructive mt-1 text-xs">{nicknameError}</p>}
        <p className="text-muted-foreground mt-1 text-xs">{nickname.trim().length}/20</p>
      </div>

      {/* Bio */}
      <div className="mb-4">
        <label className="text-foreground mb-1.5 block text-sm font-medium">
          한줄 소개 <span className="text-muted-foreground text-xs">(선택)</span>
        </label>
        <Input
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="나를 한줄로 표현해보세요"
          maxLength={50}
        />
        <p className="text-muted-foreground mt-1 text-xs">{bio.length}/50</p>
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          이전
        </Button>
        <Button onClick={onNext} disabled={!canProceed} className="gap-1">
          다음
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
