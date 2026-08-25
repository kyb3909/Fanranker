"use client"

import { useState } from "react"
import { useSignIn, useSignUp } from "@clerk/nextjs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { User } from "lucide-react"
import Link from "@/components/ui/app-link"
import { useRouter } from "next/navigation"
import Image from "next/image"

const CLERK_ERROR_MAP: Record<string, string> = {
  form_password_incorrect: "비밀번호가 올바르지 않습니다.",
  form_identifier_not_found: "등록되지 않은 이메일입니다.",
  form_param_nil: "이메일과 비밀번호를 모두 입력해주세요.",
  too_many_attempts: "너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.",
  form_password_pwned: "보안에 취약한 비밀번호입니다. 다른 비밀번호를 사용해주세요.",
  session_exists: "이미 로그인되어 있습니다.",
}

function getErrorMessage(err: unknown): string {
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
  return "로그인 중 오류가 발생했습니다. 다시 시도해주세요."
}

export function SignInMenu() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const { signUp: clerkSignUp } = useSignUp()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  // 이메일 코드 2차 인증 단계 (Clerk이 needs_second_factor 반환 시)
  const [mfaMode, setMfaMode] = useState(false)
  const [mfaCode, setMfaCode] = useState("")

  async function handleGoogleSignIn() {
    if (!isLoaded || !signIn) return
    setError("")
    setGoogleLoading(true)
    try {
      // 로그인 후 보던 페이지로 그대로 복귀
      const returnTo = window.location.pathname + window.location.search
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: returnTo || "/",
      })
    } catch {
      // 계정이 없으면 signIn 실패 → 자동으로 signUp으로 폴백
      try {
        if (clerkSignUp) {
          await clerkSignUp.authenticateWithRedirect({
            strategy: "oauth_google",
            redirectUrl: "/sso-callback",
            redirectUrlComplete: "/sign-up",
          })
          return
        }
      } catch (signUpErr) {
        setError(getErrorMessage(signUpErr))
      }
      setGoogleLoading(false)
    }
  }

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoaded || !signIn) return
    setError("")
    setLoading(true)
    try {
      const result = await signIn.create({ identifier: email, password })
      if (result.status === "complete") {
        await setActive!({ session: result.createdSessionId })
        // 로그인한 그 페이지에 그대로 머무름 — 이동 없이 인증 상태만 갱신.
        router.refresh()
      } else if (result.status === "needs_second_factor") {
        // Clerk이 2차 인증을 요구 — 이메일 코드를 보내고 코드 입력 단계로 전환.
        const emailFactor = result.supportedSecondFactors?.find((f) => f.strategy === "email_code")
        if (emailFactor && "emailAddressId" in emailFactor) {
          await signIn.prepareSecondFactor({
            strategy: "email_code",
            emailAddressId: emailFactor.emailAddressId,
          })
          setMfaMode(true)
        } else {
          setError("추가 인증이 필요한 계정이에요. 'Google로 계속하기'를 사용해 주세요.")
        }
      } else {
        console.warn("[sign-in] incomplete status:", result.status)
        setError(
          "로그인을 완료하지 못했어요. 구글로 가입했다면 'Google로 계속하기'를 사용해 주세요."
        )
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // 이메일로 받은 2차 인증 코드 확인
  async function handleVerifyMfa(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoaded || !signIn) return
    setError("")
    setLoading(true)
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "email_code",
        code: mfaCode.trim(),
      })
      if (result.status === "complete") {
        await setActive!({ session: result.createdSessionId })
        // 로그인한 그 페이지에 그대로 머무름.
        router.refresh()
      } else {
        setError("인증코드가 올바르지 않습니다. 다시 시도해 주세요.")
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* 아이콘 단독(36px)이 사이트 유일의 가입 진입점이었다 (2026-07-30 워룸)
            — 텍스트 pill 로 바꿔 "여기서 시작한다"가 보이게 한다 */}
        <Button
          className="h-9 rounded-full px-4 text-[13px] font-bold text-white hover:opacity-90"
          style={{ background: "var(--wc-burgundy, #961e37)" }}
          aria-label="로그인 메뉴"
        >
          <User className="h-[15px] w-[15px]" aria-hidden="true" />
          로그인
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="bg-card border-border mt-2 w-[calc(100vw-2rem)] max-w-[360px] overflow-hidden rounded-xl border p-0 shadow-lg"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center px-6 pt-6 pb-2 text-center">
          <Image
            src="/mascot/hi.webp"
            alt=""
            width={60}
            height={60}
            className="mb-2 h-[60px] w-[60px] select-none"
            draggable={false}
          />
          <h2 className="text-foreground text-xl font-bold">로그인</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            가입하고 승부예측으로 점수를 쌓아보세요
          </p>
        </div>

        <div className="px-6 pb-4">
          {mfaMode ? (
            /* 이메일 코드 2차 인증 입력 */
            <form onSubmit={handleVerifyMfa} className="space-y-3">
              <p className="text-muted-foreground text-sm leading-relaxed">
                <b className="text-foreground">{email}</b>로 인증코드를 보냈어요. 메일을 확인하고
                코드를 입력해 주세요.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="sign-in-mfa-code" className="text-sm">
                  인증코드
                </Label>
                <Input
                  id="sign-in-mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="이메일로 받은 코드"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={!isLoaded || loading}>
                {loading ? <Spinner className="size-4" /> : "인증코드 확인"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMfaMode(false)
                  setMfaCode("")
                  setError("")
                }}
                className="text-muted-foreground hover:text-foreground w-full text-center text-xs"
              >
                ← 다른 계정으로 로그인
              </button>
            </form>
          ) : (
            <>
              {/* Google OAuth */}
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full gap-3 font-medium"
                onClick={handleGoogleSignIn}
                disabled={!isLoaded || googleLoading}
              >
                {googleLoading ? (
                  <Spinner className="size-5" />
                ) : (
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
                )}
                Google로 계속하기
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
              <form onSubmit={handleEmailSignIn} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sign-in-email" className="text-sm">
                    이메일 주소
                  </Label>
                  <Input
                    id="sign-in-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sign-in-password" className="text-sm">
                    비밀번호
                  </Label>
                  <Input
                    id="sign-in-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>

                {error && (
                  <p className="text-destructive text-sm" role="alert">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={!isLoaded || loading}>
                  {loading ? <Spinner className="size-4" /> : "로그인"}
                </Button>
              </form>
            </>
          )}

          {/* Sign up link */}
          <p className="text-muted-foreground mt-4 text-center text-sm">
            계정이 없으신가요?{" "}
            <Link href="/sign-up" className="text-primary hover:text-primary/80 font-medium">
              회원가입
            </Link>
          </p>
        </div>

        {/* Terms footer */}
        <p className="border-border text-muted-foreground border-t px-4 py-3 text-center text-[12px] leading-relaxed">
          가입하면{" "}
          <Link
            href="/terms"
            className="text-primary hover:text-primary/80 underline underline-offset-2"
          >
            이용약관
          </Link>
          과{" "}
          <Link
            href="/privacy"
            className="text-primary hover:text-primary/80 underline underline-offset-2"
          >
            개인정보처리방침
          </Link>
          에 동의한 것으로 간주됩니다.
        </p>
      </PopoverContent>
    </Popover>
  )
}
