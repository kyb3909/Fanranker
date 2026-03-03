"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"
import { Check, ChevronRight, User, Camera, Loader2, ExternalLink, Sparkles } from "lucide-react"
import Image from "next/image"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

interface Category {
  id: string
  slug: string
  name: string
  icon: string | null
  sort_order: number
  description: string | null
}

// ────────────────────────────────────────────
// Step indicator
// ────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1
        const isActive = step === current
        const isDone = step < current
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                isDone
                  ? "bg-primary text-primary-foreground"
                  : isActive
                    ? "bg-primary text-primary-foreground ring-primary/30 ring-4"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {isDone ? <Check className="h-4 w-4" /> : step}
            </div>
            {step < total && (
              <div
                className={`h-0.5 w-8 rounded-full transition-colors ${
                  isDone ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────
// Main onboarding page
// ────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const { isSignedIn, isLoaded } = useAuth()

  // Redirect to sign-up if not signed in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-up")
    }
  }, [isLoaded, isSignedIn, router])

  // Check if already completed onboarding
  const { data: profile, isLoading: profileLoading } = useSWR(
    isSignedIn ? "/api/profile/me" : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  useEffect(() => {
    if (profile && profile.onboarding_completed === true) {
      router.replace("/")
    }
  }, [profile, router])

  // ── Step state ──
  const [step, setStep] = useState(1)

  // ── Step 1: Terms ──
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)

  // ── Step 2: Profile ──
  const [nickname, setNickname] = useState("")
  const [bio, setBio] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Step 3: Communities ──
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false)

  // Load categories
  const { data: catData } = useSWR<{ categories: Category[] }>("/api/categories", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })

  const { sportsCommunities, lifeCommunities } = useMemo(() => {
    const cats = catData?.categories || []
    const sports = cats.filter((c) => c.sort_order <= 4)
    const life = cats.filter((c) => c.sort_order > 4)
    return { sportsCommunities: sports, lifeCommunities: life }
  }, [catData])

  // Pre-fill nickname from existing profile (Clerk default)
  useEffect(() => {
    if (profile?.nickname && !nickname) {
      // Don't pre-fill if it's a Clerk default like User_xxxxx
      if (!profile.nickname.startsWith("User_")) {
        setNickname(profile.nickname)
      }
    }
    if (profile?.avatar_url && !avatarUrl) {
      setAvatarUrl(profile.avatar_url)
    }
  }, [profile, nickname, avatarUrl])

  // ── Nickname validation ──
  const nicknameError = useMemo(() => {
    if (!nickname) return null
    const trimmed = nickname.trim()
    if (trimmed.length < 2) return "2자 이상 입력해주세요."
    if (trimmed.length > 20) return "20자 이하로 입력해주세요."
    if (!/^[가-힣a-zA-Z0-9]+$/.test(trimmed)) return "한글, 영문, 숫자만 사용할 수 있습니다."
    return null
  }, [nickname])

  // ── Avatar upload ──
  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "파일 크기는 10MB 이하여야 합니다." })
      return
    }

    setAvatarUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/upload/image?type=avatar", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "업로드 실패")
      }

      const { url } = await res.json()
      setAvatarUrl(url)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "업로드 실패",
        description: err instanceof Error ? err.message : "다시 시도해주세요.",
      })
    } finally {
      setAvatarUploading(false)
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }, [])

  // ── Toggle community selection ──
  const toggleCommunity = useCallback((slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }, [])

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)

    try {
      // 1. Update profile
      const profileRes = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          avatar_url: avatarUrl,
          bio: bio.trim() || null,
          onboarding_completed: true,
        }),
      })

      if (!profileRes.ok) {
        const data = await profileRes.json().catch(() => ({}))
        throw new Error(data.error || "프로필 저장 실패")
      }

      // 2. Follow selected communities (parallel)
      const followPromises = Array.from(selectedSlugs).map((slug) =>
        fetch(`/api/community/${slug}/follow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      )
      await Promise.allSettled(followPromises)

      // 3. Redirect to home
      router.replace("/")
    } catch (err) {
      toast({
        variant: "destructive",
        title: "오류",
        description: err instanceof Error ? err.message : "다시 시도해주세요.",
      })
      setSubmitting(false)
    }
  }, [submitting, nickname, avatarUrl, bio, selectedSlugs, router])

  // ── Can proceed checks ──
  const canProceedStep1 = termsAgreed && privacyAgreed
  const canProceedStep2 = nickname.trim().length >= 2 && !nicknameError
  const canProceedStep3 = selectedSlugs.size >= 1

  // ── Loading state ──
  if (!isLoaded || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="text-primary h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isSignedIn) return null

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-foreground text-2xl font-bold">팬랭커에 오신 걸 환영합니다!</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            간단한 설정으로 나만의 커뮤니티를 시작하세요.
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex justify-center">
          <StepIndicator current={step} total={3} />
        </div>

        <Card className="overflow-hidden border p-0 shadow-md">
          {/* ══════════ Step 1: 약관 동의 ══════════ */}
          {step === 1 && (
            <div className="p-6">
              <h2 className="text-foreground mb-1 text-lg font-bold">약관 동의</h2>
              <p className="text-muted-foreground mb-5 text-sm">
                서비스 이용을 위해 약관에 동의해주세요.
              </p>

              <div className="space-y-3">
                {/* 이용약관 */}
                <label className="border-border hover:bg-muted/40 flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={termsAgreed}
                    onClick={() => setTermsAgreed(!termsAgreed)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      termsAgreed
                        ? "bg-primary border-primary text-white"
                        : "border-input bg-background"
                    }`}
                  >
                    {termsAgreed && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <div className="flex-1">
                    <span className="text-foreground text-sm font-medium">
                      이용약관에 동의합니다
                    </span>
                    <span className="text-muted-foreground ml-1 text-xs">(필수)</span>
                  </div>
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </label>

                {/* 개인정보처리방침 */}
                <label className="border-border hover:bg-muted/40 flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={privacyAgreed}
                    onClick={() => setPrivacyAgreed(!privacyAgreed)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      privacyAgreed
                        ? "bg-primary border-primary text-white"
                        : "border-input bg-background"
                    }`}
                  >
                    {privacyAgreed && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <div className="flex-1">
                    <span className="text-foreground text-sm font-medium">
                      개인정보처리방침에 동의합니다
                    </span>
                    <span className="text-muted-foreground ml-1 text-xs">(필수)</span>
                  </div>
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </label>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={() => setStep(2)} disabled={!canProceedStep1} className="gap-1">
                  다음
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ══════════ Step 2: 프로필 설정 ══════════ */}
          {step === 2 && (
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
                    onChange={handleAvatarUpload}
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
                <Button variant="ghost" onClick={() => setStep(1)}>
                  이전
                </Button>
                <Button onClick={() => setStep(3)} disabled={!canProceedStep2} className="gap-1">
                  다음
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ══════════ Step 3: 관심 게시판 ══════════ */}
          {step === 3 && (
            <div className="p-6">
              <h2 className="text-foreground mb-1 text-lg font-bold">관심 게시판 선택</h2>
              <p className="text-muted-foreground mb-5 text-sm">
                관심 있는 게시판을 선택하면 맞춤 피드를 볼 수 있어요. (1개 이상)
              </p>

              {/* Sports */}
              {sportsCommunities.length > 0 && (
                <div className="mb-4">
                  <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                    스포츠
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sportsCommunities.map((cat) => {
                      const isSelected = selectedSlugs.has(cat.slug)
                      return (
                        <button
                          key={cat.slug}
                          type="button"
                          onClick={() => toggleCommunity(cat.slug)}
                          className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-all ${
                            isSelected
                              ? "bg-primary/10 border-primary text-primary"
                              : "border-border text-foreground hover:border-primary/50 hover:bg-muted/40"
                          }`}
                        >
                          <span>{cat.icon || "📋"}</span>
                          <span>{cat.name}</span>
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Life */}
              {lifeCommunities.length > 0 && (
                <div className="mb-4">
                  <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                    라이프
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {lifeCommunities.map((cat) => {
                      const isSelected = selectedSlugs.has(cat.slug)
                      return (
                        <button
                          key={cat.slug}
                          type="button"
                          onClick={() => toggleCommunity(cat.slug)}
                          className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-all ${
                            isSelected
                              ? "bg-primary/10 border-primary text-primary"
                              : "border-border text-foreground hover:border-primary/50 hover:bg-muted/40"
                          }`}
                        >
                          <span>{cat.icon || "📋"}</span>
                          <span>{cat.name}</span>
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <p className="text-muted-foreground mb-4 text-xs">{selectedSlugs.size}개 선택됨</p>

              <div className="mt-2 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  이전
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canProceedStep3 || submitting}
                  className="gap-1.5"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      시작하기
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
