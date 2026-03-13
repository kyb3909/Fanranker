import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronRight, User, Camera, Loader2, Coins } from "lucide-react"
import Image from "next/image"

const MBTI_TYPES = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
] as const

interface ProfileStepProps {
  nickname: string
  setNickname: (v: string) => void
  nicknameError: string | null
  nicknameChecking?: boolean
  bio: string
  setBio: (v: string) => void
  avatarUrl: string | null
  avatarUploading: boolean
  onAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  favoriteTeam: string
  setFavoriteTeam: (v: string) => void
  favoritePlayer: string
  setFavoritePlayer: (v: string) => void
  mbti: string
  setMbti: (v: string) => void
  onNext: () => void
  onBack: () => void
}

export function ProfileStep({
  nickname,
  setNickname,
  nicknameError,
  nicknameChecking,
  bio,
  setBio,
  avatarUrl,
  avatarUploading,
  onAvatarUpload,
  favoriteTeam,
  setFavoriteTeam,
  favoritePlayer,
  setFavoritePlayer,
  mbti,
  setMbti,
  onNext,
  onBack,
}: ProfileStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canProceed = nickname.trim().length >= 2 && !nicknameError && !nicknameChecking

  return (
    <div className="p-6">
      <h2 className="text-foreground mb-1 text-lg font-bold">프로필 설정</h2>
      <p className="text-muted-foreground mb-5 text-sm">
        커뮤니티에서 사용할 프로필을 설정해주세요.
      </p>

      {/* Avatar */}
      <div className="mb-5 flex flex-col items-center gap-1.5">
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
        {!avatarUrl && (
          <span className="flex items-center gap-1 text-[11px] text-amber-600">
            <Coins className="h-3 w-3" />
            프로필 사진 설정 시 +200 골드
          </span>
        )}
        {avatarUrl && <span className="text-[11px] text-green-600">+200 골드 보상 예정!</span>}
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
        {nicknameChecking && <p className="text-muted-foreground mt-1 text-xs">중복 확인 중...</p>}
        {!nicknameChecking && nicknameError && (
          <p className="text-destructive mt-1 text-xs">{nicknameError}</p>
        )}
        {!nicknameChecking && !nicknameError && nickname.trim().length >= 2 && (
          <p className="mt-1 text-xs text-green-600">사용 가능한 닉네임입니다.</p>
        )}
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

      {/* Favorite Team & Player */}
      <div className="border-border bg-muted/30 mb-4 rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-500" />
          <p className="text-foreground text-sm font-medium">최애 팀 & 선수</p>
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">
            +300 골드
          </span>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-foreground mb-1.5 block text-xs font-medium">
              최애 팀 <span className="text-muted-foreground">(선택)</span>
            </label>
            <Input
              value={favoriteTeam}
              onChange={(e) => setFavoriteTeam(e.target.value)}
              placeholder="예: 리버풀, LG 트윈스, T1"
              maxLength={30}
            />
          </div>
          <div>
            <label className="text-foreground mb-1.5 block text-xs font-medium">
              최애 선수 <span className="text-muted-foreground">(선택)</span>
            </label>
            <Input
              value={favoritePlayer}
              onChange={(e) => setFavoritePlayer(e.target.value)}
              placeholder="예: 손흥민, 오타니, 페이커"
              maxLength={30}
            />
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-[11px]">
          하나라도 입력하면 300 골드를 드려요!
        </p>
      </div>

      {/* MBTI */}
      <div className="border-border bg-muted/30 mb-4 rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-500" />
          <p className="text-foreground text-sm font-medium">MBTI</p>
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">
            +500 골드
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {MBTI_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setMbti(mbti === type ? "" : type)}
              className={`rounded-lg py-2 text-xs font-bold transition-all ${
                mbti === type
                  ? "bg-primary text-white shadow-sm"
                  : "bg-background border-border text-foreground hover:bg-muted border"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground mt-2 text-[11px]">
          MBTI를 선택하면 500 골드 + 게임에서 MBTI별 통계를 볼 수 있어요!
        </p>
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
