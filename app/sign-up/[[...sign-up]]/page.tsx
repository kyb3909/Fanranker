"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth, useSignUp } from "@clerk/nextjs"
import { Card } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import Link from "@/components/ui/app-link"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { trackEvent } from "@/lib/analytics/events"

import {
  type Category,
  getClerkErrorMessage,
  StepIndicator,
  SS_TERMS_AGREED,
} from "@/components/sign-up/sign-up-shared"
import { TermsStep } from "@/components/sign-up/terms-step"
import { AuthStep } from "@/components/sign-up/auth-step"
import { ProfileStep } from "@/components/sign-up/profile-step"
import { CommunitiesStep } from "@/components/sign-up/communities-step"

// ────────────────────────────────────────────
// Main sign-up page (4-step integrated flow)
// ────────────────────────────────────────────
export default function SignUpPage() {
  const router = useRouter()
  const { isSignedIn, isLoaded: authLoaded } = useAuth()
  const { signUp, setActive, isLoaded: signUpLoaded } = useSignUp()

  // ── Step state ──
  const [step, setStep] = useState(1)

  // ── Step 1: Terms ──
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)

  // ── Step 2: Account creation ──
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [authError, setAuthError] = useState("")
  const [authLoading, setAuthLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // ── Step 2.5: Email verification ──
  const [verifying, setVerifying] = useState(false)
  const [verificationCode, setVerificationCode] = useState("")
  const [verifyLoading, setVerifyLoading] = useState(false)

  // ── Step 3: Profile ──
  const [nickname, setNickname] = useState("")
  const [bio, setBio] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [favoriteTeam, setFavoriteTeam] = useState("")
  const [favoritePlayer, setFavoritePlayer] = useState("")

  // ── Step 4: Communities ──
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false)
  const [signupMethod, setSignupMethod] = useState<"email" | "google">("email")

  // ── Clerk load timeout: if Clerk fails to init (e.g. prod keys on localhost),
  //    don't block the page forever — assume not signed in after 3s.
  const [clerkTimedOut, setClerkTimedOut] = useState(false)
  useEffect(() => {
    if (authLoaded) return
    const timer = setTimeout(() => setClerkTimedOut(true), 3000)
    return () => clearTimeout(timer)
  }, [authLoaded])

  const effectiveLoaded = authLoaded || clerkTimedOut

  // ── Profile check (for already-signed-in users) ──
  const { data: profile, isLoading: profileLoading } = useSWR(
    isSignedIn ? "/api/profile/me" : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  // If already signed in + onboarding completed → redirect home
  useEffect(() => {
    if (!effectiveLoaded) return
    if (isSignedIn && profile?.onboarding_completed === true) {
      router.replace("/")
    }
  }, [effectiveLoaded, isSignedIn, profile, router])

  // OAuth redirect return: signed in + sessionStorage has terms agreed → skip to step 3
  useEffect(() => {
    if (!effectiveLoaded) return
    if (isSignedIn && profile && profile.onboarding_completed !== true) {
      const termsWereAgreed = sessionStorage.getItem(SS_TERMS_AGREED)
      if (termsWereAgreed === "true") {
        sessionStorage.removeItem(SS_TERMS_AGREED)
        setTermsAgreed(true)
        setPrivacyAgreed(true)
        setStep(3)
      } else if (step <= 2) {
        // Signed in but no terms flag (e.g. middleware redirect) → start from step 1
        // step > 2인 경우는 이메일 인증 완료 후이므로 리셋하지 않음
        setStep(1)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveLoaded, isSignedIn, profile])

  // Pre-fill nickname from existing profile
  useEffect(() => {
    if (profile?.nickname && !nickname) {
      if (!profile.nickname.startsWith("User_")) {
        setNickname(profile.nickname)
      }
    }
    if (profile?.avatar_url && !avatarUrl) {
      setAvatarUrl(profile.avatar_url)
    }
  }, [profile, nickname, avatarUrl])

  // Load categories for step 4
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

  // ── Nickname validation ──
  const [nicknameTaken, setNicknameTaken] = useState(false)
  const [nicknameChecking, setNicknameChecking] = useState(false)

  const nicknameFormatError = useMemo(() => {
    if (!nickname) return null
    const trimmed = nickname.trim()
    if (trimmed.length < 2) return "2자 이상 입력해주세요."
    if (trimmed.length > 20) return "20자 이하로 입력해주세요."
    if (!/^[가-힣a-zA-Z0-9]+$/.test(trimmed)) return "한글, 영문, 숫자만 사용할 수 있습니다."
    return null
  }, [nickname])

  // 닉네임 중복 체크 (debounce)
  useEffect(() => {
    setNicknameTaken(false)
    const trimmed = nickname.trim()
    if (!trimmed || trimmed.length < 2 || nicknameFormatError) return

    setNicknameChecking(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/profile/check-nickname?nickname=${encodeURIComponent(trimmed)}`
        )
        const data = await res.json()
        setNicknameTaken(!data.available)
      } catch {
        // 실패 시 무시
      } finally {
        setNicknameChecking(false)
      }
    }, 400)
    return () => {
      clearTimeout(timer)
      setNicknameChecking(false)
    }
  }, [nickname, nicknameFormatError])

  const nicknameError =
    nicknameFormatError || (nicknameTaken ? "이미 사용 중인 닉네임입니다." : null)

  // ── Avatar upload (client-side compression) ──
  const compressImage = useCallback(async (file: File, maxSize: number): Promise<Blob> => {
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
  }, [])

  const handleAvatarUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (file.size > 10 * 1024 * 1024) {
        toast({ variant: "destructive", title: "파일 크기는 10MB 이하여야 합니다." })
        return
      }

      setAvatarUploading(true)
      try {
        // 아바타는 512px로 클라이언트에서 미리 압축 (413 방지)
        const compressed = await compressImage(file, 512)
        const formData = new FormData()
        formData.append("file", new File([compressed], "avatar.webp", { type: "image/webp" }))

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
      }
    },
    [compressImage]
  )

  // ── Toggle community selection ──
  const toggleCommunity = useCallback((slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }, [])

  // ── Step 2: Google OAuth ──
  const handleGoogleSignUp = useCallback(async () => {
    if (!signUpLoaded || !signUp) return
    setAuthError("")
    setGoogleLoading(true)
    setSignupMethod("google")
    try {
      // Save terms agreement before redirect
      sessionStorage.setItem(SS_TERMS_AGREED, "true")
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/sign-up",
      })
    } catch (err) {
      sessionStorage.removeItem(SS_TERMS_AGREED)
      setAuthError(getClerkErrorMessage(err))
      setGoogleLoading(false)
    }
  }, [signUpLoaded, signUp])

  // ── Step 2: Email/Password sign up ──
  const handleEmailSignUp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!signUpLoaded || !signUp) return
      if (password !== confirmPassword) {
        setAuthError("비밀번호가 일치하지 않습니다.")
        return
      }
      setAuthError("")
      setAuthLoading(true)
      // 약관 동의 플래그 저장 (인증 후 useEffect에서 step 리셋 방지)
      sessionStorage.setItem(SS_TERMS_AGREED, "true")
      try {
        const result = await signUp.create({
          emailAddress: email,
          password,
        })

        if (result.status === "complete") {
          // No email verification needed
          await setActive!({ session: result.createdSessionId })
          setStep(3)
        } else if (
          result.status === "missing_requirements" &&
          result.unverifiedFields?.includes("email_address")
        ) {
          // Email verification required
          await signUp.prepareEmailAddressVerification({ strategy: "email_code" })
          setVerifying(true)
        }
      } catch (err) {
        setAuthError(getClerkErrorMessage(err))
      } finally {
        setAuthLoading(false)
      }
    },
    [signUpLoaded, signUp, email, password, confirmPassword, setActive]
  )

  // ── Step 2.5: Verify email code ──
  const handleVerifyEmail = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!signUpLoaded || !signUp) return
      setAuthError("")
      setVerifyLoading(true)
      try {
        const result = await signUp.attemptEmailAddressVerification({
          code: verificationCode,
        })

        if (result.status === "complete") {
          await setActive!({ session: result.createdSessionId })
          setVerifying(false)
          setStep(3)
        }
      } catch (err) {
        setAuthError(getClerkErrorMessage(err))
      } finally {
        setVerifyLoading(false)
      }
    },
    [signUpLoaded, signUp, verificationCode, setActive]
  )

  // ── Resend verification code ──
  const handleResendCode = useCallback(async () => {
    if (!signUpLoaded || !signUp) return
    setAuthError("")
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" })
      toast({ title: "인증코드가 재전송되었습니다." })
    } catch (err) {
      setAuthError(getClerkErrorMessage(err))
    }
  }, [signUpLoaded, signUp])

  // ── Final submit ──
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
          favorite_team: favoriteTeam.trim() || null,
          favorite_player: favoritePlayer.trim() || null,
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

      // 3. Gold rewards (fire-and-forget, don't block redirect)
      const rewardPromises: Promise<unknown>[] = []

      // 최애 팀/선수 설정 보상: +100 골드
      if (favoriteTeam.trim() || favoritePlayer.trim()) {
        rewardPromises.push(
          fetch("/api/gold/reward", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: 100,
              description: "온보딩 최애 팀/선수 설정 보상",
              transaction_type: "onboarding_reward",
            }),
          })
        )
      }

      // 보상 지급 완료 후 리다이렉트 (fetch 취소 방지)
      if (rewardPromises.length > 0) {
        await Promise.allSettled(rewardPromises)
      }

      // 4. Analytics: 가입 완료 이벤트
      trackEvent({ name: "signup_complete", params: { method: signupMethod } })

      // 5. 환영 메시지 + 홈으로 이동 (toast가 보이도록 약간 딜레이)
      toast({
        title: "공놀이판에 오신 것을 환영합니다!",
        duration: 5000,
      })
      await new Promise((r) => setTimeout(r, 500))
      router.replace("/")
    } catch (err) {
      toast({
        variant: "destructive",
        title: "오류",
        description: err instanceof Error ? err.message : "다시 시도해주세요.",
      })
      setSubmitting(false)
    }
  }, [
    submitting,
    nickname,
    avatarUrl,
    bio,
    favoriteTeam,
    favoritePlayer,
    selectedSlugs,
    signupMethod,
    router,
  ])

  // ── Derived ──
  const isAlreadySignedIn = isSignedIn && step !== 2
  const totalSteps = 4

  // ── Loading state ──
  if (!effectiveLoaded || (isSignedIn && profileLoading)) {
    return (
      <div className="worldcup-scope flex min-h-screen items-center justify-center">
        <Loader2
          className="h-8 w-8 animate-spin"
          style={{ color: "var(--wc-burgundy, #a0203b)" }}
        />
      </div>
    )
  }

  // Already onboarded
  if (isSignedIn && profile?.onboarding_completed === true) {
    return null
  }

  return (
    <div className="worldcup-scope flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="wc-sec-eb">WELCOME</div>
          <h1
            className="font-black tracking-tight"
            style={{
              fontSize: "clamp(22px, 3.5vw, 28px)",
              color: "var(--wc-ink, #1a1416)",
              letterSpacing: "-0.02em",
            }}
          >
            공놀이판에 오신 걸 환영합니다!
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--wc-mute, #7a6b65)" }}>
            간단한 설정으로 나만의 커뮤니티를 시작하세요.
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex justify-center">
          <StepIndicator current={step} total={totalSteps} />
        </div>

        <Card
          className="overflow-hidden p-0"
          style={{
            background: "var(--wc-card, #ffffff)",
            boxShadow: "var(--wc-shadow-2)",
          }}
        >
          {/* Step 1: 약관 동의 */}
          {step === 1 && (
            <TermsStep
              termsAgreed={termsAgreed}
              setTermsAgreed={setTermsAgreed}
              privacyAgreed={privacyAgreed}
              setPrivacyAgreed={setPrivacyAgreed}
              onNext={() => setStep(isAlreadySignedIn ? 3 : 2)}
            />
          )}

          {/* Step 2: 계정 생성 + Step 2.5: 이메일 인증 */}
          {step === 2 && !isSignedIn && (
            <AuthStep
              signUpLoaded={!!signUpLoaded}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              authError={authError}
              authLoading={authLoading}
              googleLoading={googleLoading}
              onEmailSignUp={handleEmailSignUp}
              onGoogleSignUp={handleGoogleSignUp}
              onBack={() => setStep(1)}
              verifying={verifying}
              verificationCode={verificationCode}
              setVerificationCode={setVerificationCode}
              verifyLoading={verifyLoading}
              onVerifyEmail={handleVerifyEmail}
              onResendCode={handleResendCode}
              onBackFromVerify={() => {
                setVerifying(false)
                setVerificationCode("")
                setAuthError("")
              }}
            />
          )}

          {/* Step 3: 프로필 설정 */}
          {step === 3 && (
            <ProfileStep
              nickname={nickname}
              setNickname={setNickname}
              nicknameError={nicknameError}
              nicknameChecking={nicknameChecking}
              bio={bio}
              setBio={setBio}
              avatarUrl={avatarUrl}
              avatarUploading={avatarUploading}
              onAvatarUpload={handleAvatarUpload}
              favoriteTeam={favoriteTeam}
              setFavoriteTeam={setFavoriteTeam}
              favoritePlayer={favoritePlayer}
              setFavoritePlayer={setFavoritePlayer}
              onNext={() => setStep(4)}
              onBack={() => setStep(isAlreadySignedIn ? 1 : 2)}
            />
          )}

          {/* Step 4: 관심 게시판 */}
          {step === 4 && (
            <CommunitiesStep
              sportsCommunities={sportsCommunities}
              lifeCommunities={lifeCommunities}
              selectedSlugs={selectedSlugs}
              toggleCommunity={toggleCommunity}
              submitting={submitting}
              onSubmit={handleSubmit}
              onBack={() => setStep(3)}
            />
          )}
        </Card>

        {/* Terms footer */}
        <p className="text-muted-foreground mt-4 text-center text-[11px] leading-relaxed">
          가입 시{" "}
          <Link
            href="/terms"
            className="text-primary hover:text-primary/80 underline underline-offset-2"
          >
            이용약관
          </Link>{" "}
          및{" "}
          <Link
            href="/privacy"
            className="text-primary hover:text-primary/80 underline underline-offset-2"
          >
            개인정보처리방침
          </Link>
          에 동의하는 것으로 간주합니다.
        </p>
      </div>
    </div>
  )
}
