"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserProfileBadge } from "@/components/profile/user-profile-badge"
import { Calendar, Sparkles, FileText, ImageIcon } from "lucide-react"

interface DisplayTitle {
  id: string
  name: string
  flair_name: string
}

interface ProfileHeroProps {
  avatarUrl: string
  nickname: string
  fallbackChar: string
  bio: string | null | undefined
  isExpert: boolean
  isJournalist: boolean
  createdAt: string | null | undefined
  displayTitle: DisplayTitle | null
  postCount: number
  pixelArtCount: number
  flairCount: number
}

export function ProfileHero({
  avatarUrl,
  nickname,
  fallbackChar,
  bio,
  isExpert,
  isJournalist,
  createdAt,
  displayTitle,
  postCount,
  pixelArtCount,
  flairCount,
}: ProfileHeroProps) {
  const joinedLabel = createdAt
    ? new Date(createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long" })
    : null

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      {/* 헤더 영역 */}
      <div
        className="relative px-6 pt-7 pb-5 sm:px-8"
        style={{ background: "linear-gradient(135deg, var(--wc-soft) 0%, var(--wc-card) 100%)" }}
      >
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar className="h-[72px] w-[72px] shrink-0 ring-4 ring-white">
            <AvatarImage src={avatarUrl} alt={nickname} />
            <AvatarFallback
              className="text-2xl font-extrabold"
              style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
            >
              {fallbackChar}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1
                className="truncate font-extrabold"
                style={{ fontSize: 20, color: "var(--wc-ink)" }}
              >
                {nickname}
              </h1>
              {isExpert && <UserProfileBadge isExpert size="sm" />}
              {isJournalist && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  기자
                </span>
              )}
            </div>

            {displayTitle && (
              <div className="flex justify-center sm:justify-start">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
                  style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
                >
                  <Sparkles className="h-3 w-3" />
                  {displayTitle.flair_name} · {displayTitle.name}
                </span>
              </div>
            )}

            {bio && (
              <p className="line-clamp-2 text-sm" style={{ color: "var(--wc-mute)" }}>
                {bio}
              </p>
            )}

            {joinedLabel && (
              <div
                className="flex items-center justify-center gap-1.5 text-xs sm:justify-start"
                style={{ color: "var(--wc-mute-2)" }}
              >
                <Calendar className="h-3 w-3" />
                <span>{joinedLabel} 가입</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 통계 행 */}
      <div className="grid grid-cols-3" style={{ borderTop: "1px solid var(--wc-line)" }}>
        <Stat icon={<FileText className="h-3.5 w-3.5" />} label="작성글" value={postCount} />
        <Stat icon={<Sparkles className="h-3.5 w-3.5" />} label="활동 flair" value={flairCount} />
        <Stat icon={<ImageIcon className="h-3.5 w-3.5" />} label="픽셀아트" value={pixelArtCount} />
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 px-2 py-3"
      style={{ borderRight: "1px solid var(--wc-line)" }}
    >
      <div
        className="flex items-center gap-1 text-[10px] tracking-wide uppercase"
        style={{ color: "var(--wc-mute)" }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <span className="tnum text-lg font-extrabold" style={{ color: "var(--wc-ink)" }}>
        {value.toLocaleString()}
      </span>
    </div>
  )
}
