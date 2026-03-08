"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth, useSignUp } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/hooks/use-toast"
import {
  Check,
  ChevronRight,
  ChevronLeft,
  User,
  Camera,
  Loader2,
  ExternalLink,
  Sparkles,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────
interface Category {
  id: string
  slug: string
  name: string
  icon: string | null
  sort_order: number
  description: string | null
}

// ────────────────────────────────────────────
// Clerk error → 한국어 매핑
// ────────────────────────────────────────────
const CLERK_ERROR_MAP: Record<string, string> = {
  form_identifier_exists: "이미 가입된 이메일입니다.",
  form_password_pwned: "보안에 취약한 비밀번호입니다. 다른 비밀번호를 사용해주세요.",
  form_password_length_too_short: "비밀번호는 8자 이상이어야 합니다.",
  form_param_nil: "이메일과 비밀번호를 모두 입력해주세요.",
  too_many_attempts: "너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.",
  form_code_incorrect: "인증코드가 올바르지 않습니다.",
  verification_expired: "인증코드가 만료되었습니다. 다시 요청해주세요.",
  session_exists: "이미 로그인되어 있습니다.",
  form_password_not_strong_enough: "비밀번호가 너무 단순합니다. 더 복잡한 비밀번호를 사용해주세요.",
  form_identifier_not_found: "등록되지 않은 이메일입니다.",
}

function getClerkErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "errors" in err &&
    Array.isArray((err as { errors: unknown[] }).errors)
  ) {
    const first = (err as { errors: { code?: string; message?: string }[] }).errors[0]
    if (first?.code && CLERK_ERROR_MAP[first.code]) {
      return CLERK_ERROR_MAP[first.code]
    }
    if (first?.message) return first.message
  }
  return "오류가 발생했습니다. 다시 시도해주세요."
}

// ────────────────────────────────────────────
// Google SVG icon
// ────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

// ────────────────────────────────────────────
// Step indicator (reused from onboarding)
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
// sessionStorage keys
// ────────────────────────────────────────────
const SS_TERMS_AGREED = "signup_terms_agreed"

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Step 4: Communities ──
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false)

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
      } else {
        // Signed in but no terms flag (e.g. middleware redirect) → start from step 1
        setStep(1)
      }
    }
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

  // ── Step 2: Google OAuth ──
  const handleGoogleSignUp = useCallback(async () => {
    if (!signUpLoaded || !signUp) return
    setAuthError("")
    setGoogleLoading(true)
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
  const canProceedStep3 = nickname.trim().length >= 2 && !nicknameError
  const canProceedStep4 = selectedSlugs.size >= 1

  // ── Loading state ──
  // Uses effectiveLoaded (authLoaded OR 3s timeout) so the page is never
  // permanently blocked when Clerk can't initialise (e.g. prod keys on localhost).
  if (!effectiveLoaded || (isSignedIn && profileLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="text-primary h-8 w-8 animate-spin" />
      </div>
    )
  }

  // Already onboarded
  if (isSignedIn && profile?.onboarding_completed === true) {
    return null
  }

  // Determine total steps displayed: if already signed in, skip step 2 → show 3 steps
  const isAlreadySignedIn = isSignedIn && step !== 2
  const totalSteps = 4
  // Visual step for indicator: shows actual step number
  const displayStep = step

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
          <StepIndicator current={displayStep} total={totalSteps} />
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
                <Button
                  onClick={() => setStep(isAlreadySignedIn ? 3 : 2)}
                  disabled={!canProceedStep1}
                  className="gap-1"
                >
                  다음
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ══════════ Step 2: 계정 생성 ══════════ */}
          {step === 2 && !isSignedIn && !verifying && (
            <div className="p-6">
              <h2 className="text-foreground mb-1 text-lg font-bold">계정 만들기</h2>
              <p className="text-muted-foreground mb-5 text-sm">
                Google 또는 이메일로 가입할 수 있습니다.
              </p>

              {!signUpLoaded ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="text-primary h-6 w-6 animate-spin" />
                </div>
              ) : (
                <>
                  {/* Google OAuth */}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full gap-3 font-medium"
                    onClick={handleGoogleSignUp}
                    disabled={googleLoading}
                  >
                    {googleLoading ? <Spinner className="size-5" /> : <GoogleIcon />}
                    Google로 가입하기
                  </Button>

                  {/* Divider */}
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="border-border w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-card text-muted-foreground px-2">or</span>
                    </div>
                  </div>

                  {/* Email/Password form */}
                  <form onSubmit={handleEmailSignUp} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-email" className="text-sm">
                        이메일 주소
                      </Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="signup-password" className="text-sm">
                        비밀번호
                      </Label>
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="8자 이상"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        minLength={8}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="signup-confirm-password" className="text-sm">
                        비밀번호 확인
                      </Label>
                      <Input
                        id="signup-confirm-password"
                        type="password"
                        placeholder="비밀번호를 다시 입력해주세요"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        minLength={8}
                      />
                      {confirmPassword && password !== confirmPassword && (
                        <p className="text-destructive text-xs">비밀번호가 일치하지 않습니다.</p>
                      )}
                    </div>

                    {authError && (
                      <p className="text-destructive text-sm" role="alert">
                        {authError}
                      </p>
                    )}

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={authLoading || password !== confirmPassword}
                    >
                      {authLoading ? <Spinner className="size-4" /> : "이메일로 가입하기"}
                    </Button>
                  </form>

                  {/* Sign in link */}
                  <p className="text-muted-foreground mt-4 text-center text-sm">
                    이미 계정이 있으신가요?{" "}
                    <Link href="/" className="text-primary hover:text-primary/80 font-medium">
                      로그인
                    </Link>
                  </p>

                  <div className="mt-4 flex justify-start">
                    <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="gap-1">
                      <ChevronLeft className="h-4 w-4" />
                      이전
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════ Step 2.5: 이메일 인증코드 ══════════ */}
          {step === 2 && !isSignedIn && verifying && (
            <div className="p-6">
              <h2 className="text-foreground mb-1 text-lg font-bold">이메일 인증</h2>
              <p className="text-muted-foreground mb-5 text-sm">
                <span className="text-foreground font-medium">{email}</span>으로 전송된 인증코드를
                입력해주세요.
              </p>

              <form onSubmit={handleVerifyEmail} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="verify-code" className="text-sm">
                    인증코드
                  </Label>
                  <Input
                    id="verify-code"
                    type="text"
                    inputMode="numeric"
                    placeholder="6자리 코드"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    required
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                </div>

                {authError && (
                  <p className="text-destructive text-sm" role="alert">
                    {authError}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={verifyLoading}>
                  {verifyLoading ? <Spinner className="size-4" /> : "인증하기"}
                </Button>
              </form>

              <button
                type="button"
                onClick={handleResendCode}
                className="text-primary hover:text-primary/80 mt-3 text-sm underline underline-offset-2"
              >
                인증코드 재전송
              </button>

              <div className="mt-4 flex justify-start">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setVerifying(false)
                    setVerificationCode("")
                    setAuthError("")
                  }}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전
                </Button>
              </div>
            </div>
          )}

          {/* ══════════ Step 3: 프로필 설정 ══════════ */}
          {step === 3 && (
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
                <Button variant="ghost" onClick={() => setStep(isAlreadySignedIn ? 1 : 2)}>
                  이전
                </Button>
                <Button onClick={() => setStep(4)} disabled={!canProceedStep3} className="gap-1">
                  다음
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ══════════ Step 4: 관심 게시판 ══════════ */}
          {step === 4 && (
            <div className="p-6">
              <h2 className="text-foreground mb-1 text-lg font-bold">관심 게시판 선택</h2>
              <p className="text-muted-foreground mb-5 text-sm">
                관심 있는 게시판을 선택하면 맞춤 담벼락을 볼 수 있어요. (1개 이상)
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
                <Button variant="ghost" onClick={() => setStep(3)}>
                  이전
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canProceedStep4 || submitting}
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
