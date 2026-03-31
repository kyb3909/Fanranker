import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { ChevronLeft, Loader2 } from "lucide-react"
import Link from "@/components/ui/app-link"
import { GoogleIcon } from "./sign-up-shared"

interface AuthStepProps {
  signUpLoaded: boolean
  // Email/password
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  confirmPassword: string
  setConfirmPassword: (v: string) => void
  authError: string
  authLoading: boolean
  googleLoading: boolean
  onEmailSignUp: (e: React.FormEvent) => void
  onGoogleSignUp: () => void
  onBack: () => void
  // Verification
  verifying: boolean
  verificationCode: string
  setVerificationCode: (v: string) => void
  verifyLoading: boolean
  onVerifyEmail: (e: React.FormEvent) => void
  onResendCode: () => void
  onBackFromVerify: () => void
}

export function AuthStep({
  signUpLoaded,
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  authError,
  authLoading,
  googleLoading,
  onEmailSignUp,
  onGoogleSignUp,
  onBack,
  verifying,
  verificationCode,
  setVerificationCode,
  verifyLoading,
  onVerifyEmail,
  onResendCode,
  onBackFromVerify,
}: AuthStepProps) {
  // Email verification step
  if (verifying) {
    return (
      <div className="p-6">
        <h2 className="text-foreground mb-1 text-lg font-bold">이메일 인증</h2>
        <p className="text-muted-foreground mb-5 text-sm">
          <span className="text-foreground font-medium">{email}</span>으로 전송된 인증코드를
          입력해주세요.
        </p>

        <form onSubmit={onVerifyEmail} className="space-y-3">
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
          onClick={onResendCode}
          className="text-primary hover:text-primary/80 mt-3 text-sm underline underline-offset-2"
        >
          인증코드 재전송
        </button>

        <div className="mt-4 flex justify-start">
          <Button variant="ghost" size="sm" onClick={onBackFromVerify} className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            이전
          </Button>
        </div>
      </div>
    )
  }

  // Account creation step
  return (
    <div className="p-6">
      <h2 className="text-foreground mb-1 text-lg font-bold">계정 만들기</h2>
      <p className="text-muted-foreground mb-5 text-sm">Google 또는 이메일로 가입할 수 있습니다.</p>

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
            onClick={onGoogleSignUp}
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
          <form onSubmit={onEmailSignUp} className="space-y-3">
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
              <ul className="text-muted-foreground space-y-0.5 text-[11px]">
                <li className={password.length >= 8 ? "text-emerald-500" : ""}>
                  {password.length >= 8 ? "✓" : "•"} 8자 이상
                </li>
                <li>• 유출된 적 없는 비밀번호 (보안 검사 자동 수행)</li>
                <li>• 너무 단순한 패턴 금지 (예: 12345678, password)</li>
              </ul>
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
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              이전
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
