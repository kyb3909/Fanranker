"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Loader2, Check, Save, User, Star, Coins } from "lucide-react"

interface ProfileBasicFormProps {
  email: string
  nickname: string
  setNickname: (v: string) => void
  nicknameChangedAt: string | null
  bio: string
  setBio: (v: string) => void
  favoriteTeam: string
  setFavoriteTeam: (v: string) => void
  favoritePlayer: string
  setFavoritePlayer: (v: string) => void
  hasFavoriteSet: boolean
  isSaving: boolean
  saveSuccess: boolean
  onSave: () => void
}

export function ProfileBasicForm({
  email,
  nickname,
  setNickname,
  nicknameChangedAt,
  bio,
  setBio,
  favoriteTeam,
  setFavoriteTeam,
  favoritePlayer,
  setFavoritePlayer,
  hasFavoriteSet,
  isSaving,
  saveSuccess,
  onSave,
}: ProfileBasicFormProps) {
  const cooldownMs = 90 * 24 * 60 * 60 * 1000
  const changedAt = nicknameChangedAt ? new Date(nicknameChangedAt).getTime() : 0
  const nextChangeAt = changedAt + cooldownMs
  const isOnCooldown = changedAt > 0 && Date.now() < nextChangeAt

  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-center gap-2">
        <User className="text-primary h-5 w-5" />
        <h2 className="font-semibold">프로필 정보</h2>
      </div>

      {/* 닉네임 */}
      <div className="space-y-2">
        <Label htmlFor="nickname" className="flex items-center gap-1.5 text-xs font-semibold">
          <User className="h-3.5 w-3.5" />
          닉네임
        </Label>
        <Input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="닉네임을 입력하세요"
          maxLength={20}
          disabled={isOnCooldown}
          className={isOnCooldown ? "bg-muted" : ""}
        />
        {isOnCooldown ? (
          <p className="text-xs text-amber-600">
            {new Date(nextChangeAt).toLocaleDateString("ko-KR")} 이후 변경 가능
          </p>
        ) : (
          <p className="text-muted-foreground text-[12px]">2~20자. 변경 후 3개월간 재변경 불가</p>
        )}
      </div>

      {/* 이메일 */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">이메일</Label>
        <Input value={email} disabled className="bg-muted text-xs" />
      </div>

      <Separator />

      {/* 한줄 소개 */}
      <div className="space-y-2">
        <Label htmlFor="bio" className="text-xs font-semibold">
          한줄 소개
        </Label>
        <Input
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="자신을 한 줄로 소개해보세요"
          maxLength={50}
        />
        <p className="text-muted-foreground text-right text-[12px]">{bio.length}/50</p>
      </div>

      <Separator />

      {/* 최애 팀 & 선수 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="flex items-center gap-1.5 text-xs font-semibold">
            <Star className="h-3.5 w-3.5" />
            최애 팀 & 선수
          </Label>
          {!hasFavoriteSet && (
            <span className="flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[12px] font-bold text-amber-600">
              <Coins className="h-2.5 w-2.5" />
              +200G
            </span>
          )}
        </div>
        <Input
          value={favoriteTeam}
          onChange={(e) => setFavoriteTeam(e.target.value)}
          placeholder="최애 팀 (예: 리버풀, T1)"
          maxLength={30}
        />
        <Input
          value={favoritePlayer}
          onChange={(e) => setFavoritePlayer(e.target.value)}
          placeholder="최애 선수 (예: 손흥민, 페이커)"
          maxLength={30}
        />
      </div>

      {/* 저장 버튼 */}
      <Button className="w-full" onClick={onSave} disabled={isSaving}>
        {isSaving ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : saveSuccess ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        {isSaving ? "저장 중..." : saveSuccess ? "저장됨" : "변경사항 저장"}
      </Button>
    </Card>
  )
}
